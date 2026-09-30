-- usp_MeetingActionItem_GetById — fetch one active app.MeetingActionItem row; THROW 50001 when absent/soft-deleted.
-- Entity app.MeetingActionItem (source: tblMeetingActionItems). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_GetById
    @MeetingActionItemId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

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
    WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0;
END;
GO
