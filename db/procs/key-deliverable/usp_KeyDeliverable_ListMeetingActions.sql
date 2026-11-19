-- usp_KeyDeliverable_ListMeetingActions — the meeting action items that point at one WBS task (085), each
--   with its meeting, newest meeting first.
-- Access: Viewer on the task's project for key-deliverables:read and meetings:read.
USE ProjectManager;
GO

CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_ListMeetingActions
    @KeyDeliverableId INT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId INT;
    SELECT @ProjectId = kd.ProjectId
    FROM app.KeyDeliverable AS kd
    WHERE kd.KeyDeliverableId = @KeyDeliverableId AND kd.IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @Permission = N'key-deliverables:read', @AllowProjectless = 0;
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @Permission = N'meetings:read', @AllowProjectless = 0;

    SELECT ai.MeetingActionItemId,
           ai.[Action],
           ai.[Status],
           CAST(ai.DueDate AS DATE) AS DueDate,
           m.MeetingId,
           m.[Subject] AS MeetingSubject,
           CAST(m.StartDate AS DATE) AS MeetingDate
    FROM app.MeetingActionWbsLink AS l
    JOIN app.MeetingActionItem AS ai ON ai.MeetingActionItemId = l.MeetingActionItemId AND ai.IsDeleted = 0
    JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId AND m.IsDeleted = 0 AND m.ProjectId = @ProjectId
    WHERE l.KeyDeliverableId = @KeyDeliverableId
    ORDER BY m.StartDate DESC, m.MeetingId DESC, ai.SortOrder, ai.MeetingActionItemId;
END;
GO
