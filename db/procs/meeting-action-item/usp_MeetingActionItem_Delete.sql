-- usp_MeetingActionItem_Delete — soft delete with rowversion concurrency (checked in the transaction)
-- and an in-transaction audit row (module #10, ADR-0028). Returns ProjectId and MeetingId.
-- The meeting row is locked (UPDLOCK, HOLDLOCK) like the action reorder, which renumbers siblings.
-- Access: Manager on the meeting's project, or a per-person grant (meetings:delete, ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_Delete
    @MeetingActionItemId INT,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = ai.MeetingId
    FROM app.MeetingActionItem AS ai
    LEFT JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId
    WHERE ai.MeetingActionItemId = @MeetingActionItemId AND ai.IsDeleted = 0
      AND (ai.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

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
        (SELECT MeetingActionItemId, [MeetingId], [AgendaItemId], [DiscussionPointId], [Action],
                [AssignedToStakeholderId], [DueDate], SortOrder
         FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingActionItem SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingActionItem
                       WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;
        THROW 50002, N'CONFLICT:MeetingActionItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.MeetingActionItem', CAST(@MeetingActionItemId AS NVARCHAR(64)), @Before,
            (SELECT MeetingActionItemId, IsDeleted, DeletedAtUtc, DeletedBy
             FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
