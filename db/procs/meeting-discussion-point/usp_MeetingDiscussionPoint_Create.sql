-- usp_MeetingDiscussionPoint_Create — add a discussion point at the end of an agenda item's points
-- (module #10, ADR-0028); audits in-transaction; returns the new row with MeetingId and ProjectId.
-- DiscussionPoint is rich text sanitised by the app (ADR-0025); stored as given.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:create, ADR-0024).
-- The agenda item and its meeting must be live (NOT_FOUND 50001); the meeting row is locked while
--   the position is taken.
-- VALIDATION 50004: @AgendaItemId missing; empty DiscussionPoint.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_Create
    @AgendaItemId    INT,
    @DiscussionPoint NVARCHAR(MAX) = NULL,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @AgendaItemId IS NULL
        THROW 50004, N'VALIDATION:AgendaItemId is required', 1;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = a.MeetingId
    FROM app.MeetingAgendaItem AS a
    LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
    WHERE a.MeetingAgendaItemId = @AgendaItemId AND a.IsDeleted = 0
      AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:create', @AllowProjectless = 0;

    IF NULLIF(TRIM(@DiscussionPoint), N'') IS NULL
        THROW 50004, N'VALIDATION:DiscussionPoint is required', 1;

    BEGIN TRAN;

    IF @MeetingId IS NOT NULL
    BEGIN
        DECLARE @Locked INT;
        SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)
        WHERE MeetingId = @MeetingId AND IsDeleted = 0;
        IF @Locked IS NULL
            THROW 50001, N'NOT_FOUND:Meeting not found', 1;
    END;
    IF NOT EXISTS (SELECT 1 FROM app.MeetingAgendaItem WHERE MeetingAgendaItemId = @AgendaItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;

    DECLARE @Position INT =
        ISNULL((SELECT MAX(SortOrder) FROM app.MeetingDiscussionPoint
                WHERE AgendaItemId = @AgendaItemId AND IsDeleted = 0), 0) + 1;

    INSERT INTO app.MeetingDiscussionPoint ([AgendaItemId], [DiscussionPoint], SortOrder, CreatedBy)
    VALUES (@AgendaItemId, @DiscussionPoint, @Position, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingDiscussionPoint', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingDiscussionPointId, [AgendaItemId], [DiscussionPoint], SortOrder
             FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingDiscussionPointId,
           [AgendaItemId],
           [DiscussionPoint],
           SortOrder,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           @MeetingId AS MeetingId,
           @RowProjectId AS ProjectId
    FROM app.MeetingDiscussionPoint
    WHERE MeetingDiscussionPointId = @Id;
END;
GO
