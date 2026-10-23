-- usp_MeetingActionItem_List — the live action items of one meeting with their person responsible's
-- name (NULL when nobody is responsible), grouped by agenda item and discussion point in position
-- order (module #10, ADR-0028). A child collection: no paging or search.
-- Access: Viewer on the meeting's project (FORBIDDEN_ROW 50003); NOT_FOUND 50001 for a missing meeting.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_List
    @MeetingId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT ai.MeetingActionItemId,
           ai.[MeetingId],
           ai.[AgendaItemId],
           ai.[DiscussionPointId],
           ai.[Action],
           ai.[AssignedToStakeholderId],
           NULLIF(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N'') AS AssigneeName,
           ai.[DueDate],
           ai.[Status],
           ai.SortOrder,
           ai.CreatedAtUtc,
           ai.UpdatedAtUtc,
           CAST(ai.RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingActionItem AS ai
    LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = ai.AssignedToStakeholderId
    WHERE ai.MeetingId = @MeetingId AND ai.IsDeleted = 0
    ORDER BY ai.AgendaItemId, ai.DiscussionPointId, ai.SortOrder, ai.MeetingActionItemId;
END;
GO
