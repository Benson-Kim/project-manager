-- usp_MeetingDiscussionPoint_Delete — soft delete with rowversion concurrency (checked in the
-- transaction); the actions under the point are soft-deleted in the same transaction, and one audit
-- row lists them (module #10, ADR-0028). Returns ProjectId and MeetingId.
-- Access: Manager on the meeting's project, or a per-person grant (meetings:delete, ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_Delete
    @MeetingDiscussionPointId INT,
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
         @MinLevel = N'Manager', @Permission = N'meetings:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    IF @MeetingId IS NOT NULL
    BEGIN
        DECLARE @Locked INT;
        SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK) WHERE MeetingId = @MeetingId;
    END;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingDiscussionPointId, [AgendaItemId], [DiscussionPoint], SortOrder
         FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    UPDATE app.MeetingDiscussionPoint SET
        IsDeleted    = 1,
        DeletedAtUtc = @Now,
        DeletedBy    = @ActorUserId
    WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingDiscussionPoint
                       WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;
        THROW 50002, N'CONFLICT:MeetingDiscussionPoint was modified by someone else', 1;
    END

    DECLARE @Removed TABLE (Id INT);

    UPDATE app.MeetingActionItem SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    OUTPUT inserted.MeetingActionItemId INTO @Removed (Id)
    WHERE IsDeleted = 0 AND DiscussionPointId = @MeetingDiscussionPointId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.MeetingDiscussionPoint', CAST(@MeetingDiscussionPointId AS NVARCHAR(64)), @Before,
            (SELECT dp.MeetingDiscussionPointId, dp.IsDeleted, dp.DeletedAtUtc, dp.DeletedBy,
                    JSON_QUERY((SELECT Id FROM @Removed FOR JSON PATH)) AS ActionItems
             FROM app.MeetingDiscussionPoint AS dp WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
