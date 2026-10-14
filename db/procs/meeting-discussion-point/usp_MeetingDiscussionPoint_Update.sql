-- usp_MeetingDiscussionPoint_Update — change a discussion point's text with rowversion concurrency
-- (50002 CONFLICT, checked in the transaction) and an in-transaction audit row (module #10, ADR-0028).
-- The agenda item and the position are immutable here (moves go through _Reorder).
-- DiscussionPoint is rich text sanitised by the app (ADR-0025); stored as given.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- VALIDATION 50004: empty DiscussionPoint.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_Update
    @MeetingDiscussionPointId INT,
    @DiscussionPoint          NVARCHAR(MAX) = NULL,
    @RowVer                   BIGINT,
    @ActorUserId              INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = a.MeetingId
    FROM app.MeetingDiscussionPoint AS dp
    JOIN app.MeetingAgendaItem AS a ON a.MeetingAgendaItemId = dp.AgendaItemId AND a.IsDeleted = 0
    LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
    WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId AND dp.IsDeleted = 0
      AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF NULLIF(TRIM(@DiscussionPoint), N'') IS NULL
        THROW 50004, N'VALIDATION:DiscussionPoint is required', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingDiscussionPointId, [AgendaItemId], [DiscussionPoint], SortOrder
         FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingDiscussionPoint SET
        [DiscussionPoint] = @DiscussionPoint,
        UpdatedAtUtc      = SYSUTCDATETIME(),
        UpdatedBy         = @ActorUserId
    WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingDiscussionPoint
                       WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;
        THROW 50002, N'CONFLICT:MeetingDiscussionPoint was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingDiscussionPoint', CAST(@MeetingDiscussionPointId AS NVARCHAR(64)), @Before,
            (SELECT MeetingDiscussionPointId, [AgendaItemId], [DiscussionPoint], SortOrder
             FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId
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
    WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId;
END;
GO
