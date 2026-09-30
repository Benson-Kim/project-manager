-- usp_MeetingActionItem_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.MeetingActionItem (source: tblMeetingActionItems). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_Delete
    @MeetingActionItemId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:MeetingActionItem was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingActionItemId, [DiscussionPointId], [AgendaItemId], [Action], [AssignedToStakeholderId], [DueDate]
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
        IF NOT EXISTS (SELECT 1 FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;
        THROW 50002, N'CONFLICT:MeetingActionItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.MeetingActionItem', CAST(@MeetingActionItemId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
