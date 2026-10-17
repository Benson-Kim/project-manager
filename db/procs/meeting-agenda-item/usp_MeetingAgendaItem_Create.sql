-- usp_MeetingAgendaItem_Create — add an agenda item at the end of a meeting's agenda (module #10,
-- ADR-0028); audits in-transaction; returns the new row with its ProjectId.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:create, ADR-0024).
-- The meeting must be live (NOT_FOUND 50001); its row is locked (UPDLOCK, HOLDLOCK) while the
--   position is taken, so concurrent adds and reorders of one agenda cannot interleave.
-- VALIDATION 50004: @MeetingId missing; empty AgendaItem.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_Create
    @MeetingId   INT,
    @AgendaItem  NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @MeetingId IS NULL
        THROW 50004, N'VALIDATION:MeetingId is required', 1;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:create', @AllowProjectless = 0;

    IF NULLIF(TRIM(@AgendaItem), N'') IS NULL
        THROW 50004, N'VALIDATION:AgendaItem is required', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)
    WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    DECLARE @Position INT =
        ISNULL((SELECT MAX(SortOrder) FROM app.MeetingAgendaItem
                WHERE MeetingId = @MeetingId AND IsDeleted = 0), 0) + 1;

    INSERT INTO app.MeetingAgendaItem ([MeetingId], [AgendaItem], SortOrder, CreatedBy)
    VALUES (@MeetingId, @AgendaItem, @Position, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingAgendaItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingAgendaItemId, [MeetingId], [AgendaItem], SortOrder
             FROM app.MeetingAgendaItem WHERE MeetingAgendaItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingAgendaItemId,
           [MeetingId],
           [AgendaItem],
           SortOrder,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingAgendaItem
    WHERE MeetingAgendaItemId = @Id;
END;
GO
