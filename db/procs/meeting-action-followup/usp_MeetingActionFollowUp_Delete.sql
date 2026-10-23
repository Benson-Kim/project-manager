-- usp_MeetingActionFollowUp_Delete — soft delete with rowversion concurrency (checked in the
-- transaction) and an in-transaction audit row (module #10, ADR-0041). Returns ProjectId and
-- MeetingId.
-- The meeting row is locked (UPDLOCK, HOLDLOCK) like the follow-up reorder, which renumbers siblings.
-- Access: Manager on the meeting's project, or a per-person grant (meetings:delete, ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionFollowUp_Delete
    @MeetingActionFollowUpId INT,
    @RowVer                  BIGINT,
    @ActorUserId             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = ai.MeetingId
    FROM app.MeetingActionFollowUp AS fu
    JOIN app.MeetingActionItem AS ai
        ON ai.MeetingActionItemId = fu.MeetingActionItemId AND ai.IsDeleted = 0
    LEFT JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId
    WHERE fu.MeetingActionFollowUpId = @MeetingActionFollowUpId AND fu.IsDeleted = 0
      AND (ai.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingActionFollowUp not found', 1;

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
        (SELECT MeetingActionFollowUpId, MeetingActionItemId, [FollowUp],
                [AssignedToStakeholderId], [FollowUpDate], [DueDate], SortOrder
         FROM app.MeetingActionFollowUp WHERE MeetingActionFollowUpId = @MeetingActionFollowUpId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingActionFollowUp SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE MeetingActionFollowUpId = @MeetingActionFollowUpId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingActionFollowUp
                       WHERE MeetingActionFollowUpId = @MeetingActionFollowUpId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingActionFollowUp not found', 1;
        THROW 50002, N'CONFLICT:MeetingActionFollowUp was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.MeetingActionFollowUp',
            CAST(@MeetingActionFollowUpId AS NVARCHAR(64)), @Before,
            (SELECT MeetingActionFollowUpId, IsDeleted, DeletedAtUtc, DeletedBy
             FROM app.MeetingActionFollowUp WHERE MeetingActionFollowUpId = @MeetingActionFollowUpId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
