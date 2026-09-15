-- usp_MeetingActionItem_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.MeetingActionItem (source: tblMeetingActionItems). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_Update
    @MeetingActionItemId INT,
    @DiscussionPointId INT = NULL,
    @AgendaItemId INT = NULL,
    @Action NVARCHAR(MAX) = NULL,
    @AssignedToStakeholderId INT = NULL,
    @DueDate DATETIME2 = NULL,
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
        [DiscussionPointId] = @DiscussionPointId,
        [AgendaItemId] = @AgendaItemId,
        [Action] = @Action,
        [AssignedToStakeholderId] = @AssignedToStakeholderId,
        [DueDate] = @DueDate,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingActionItem', CAST(@MeetingActionItemId AS NVARCHAR(64)), @Before,
            (SELECT MeetingActionItemId, [DiscussionPointId], [AgendaItemId], [Action], [AssignedToStakeholderId], [DueDate]
             FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingActionItemId,
           [DiscussionPointId],
           [AgendaItemId],
           [Action],
           [AssignedToStakeholderId],
           [DueDate],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.MeetingActionItem
    WHERE MeetingActionItemId = @MeetingActionItemId;
END;
GO
