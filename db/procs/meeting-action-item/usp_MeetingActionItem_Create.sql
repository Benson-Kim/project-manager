-- usp_MeetingActionItem_Create — insert one app.MeetingActionItem row; audits in-transaction; returns the new row.
-- Entity app.MeetingActionItem (source: tblMeetingActionItems). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_Create
    @DiscussionPointId INT = NULL,
    @AgendaItemId INT = NULL,
    @Action NVARCHAR(MAX) = NULL,
    @AssignedToStakeholderId INT = NULL,
    @DueDate DATETIME2 = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    INSERT INTO app.MeetingActionItem ([DiscussionPointId], [AgendaItemId], [Action], [AssignedToStakeholderId], [DueDate], CreatedBy)
    VALUES (@DiscussionPointId, @AgendaItemId, @Action, @AssignedToStakeholderId, @DueDate, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingActionItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingActionItemId, [DiscussionPointId], [AgendaItemId], [Action], [AssignedToStakeholderId], [DueDate]
             FROM app.MeetingActionItem WHERE MeetingActionItemId = @Id
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
    WHERE MeetingActionItemId = @Id;
END;
GO
