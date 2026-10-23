-- usp_MeetingActionItem_SetStatus — move one action item to 'on-hold', 'in-progress' or 'completed'
-- (module #10, ADR-0041), with rowversion concurrency (50002 CONFLICT, checked in the transaction)
-- and an in-transaction audit row. Returns ProjectId and MeetingId.
-- One intention of its own, separate from _Update, because the carried-over list of a later meeting
--   ticks an action off without holding its text, person responsible or due date: an _Update from
--   there would have to send fields it never read, and would overwrite a concurrent edit of them.
-- 'completed' is what stops the action being carried into the project's later meetings
--   (usp_Meeting_GetWorkspace), so the set is closed here and by CK_MeetingActionItem_Status.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- VALIDATION 50004: a status outside the three.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_SetStatus
    @MeetingActionItemId INT,
    @Status              VARCHAR(12),
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
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF @Status IS NULL OR @Status NOT IN ('on-hold', 'in-progress', 'completed')
        THROW 50004, N'VALIDATION:Status must be on-hold, in-progress or completed', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingActionItemId, [MeetingId], [Status]
         FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingActionItem SET
        [Status]     = @Status,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
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
    VALUES (@ActorUserId, N'SetStatus', N'app.MeetingActionItem',
            CAST(@MeetingActionItemId AS NVARCHAR(64)), @Before,
            (SELECT MeetingActionItemId, [MeetingId], [Status]
             FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
