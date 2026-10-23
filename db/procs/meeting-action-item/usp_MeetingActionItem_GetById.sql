-- usp_MeetingActionItem_GetById — one live action item with its person responsible's name (NULL when
-- nobody is responsible; module #10, ADR-0028). The project is found through the action's meeting; an action of a deleted meeting
-- is NOT_FOUND (50001), one without a meeting (Access orphan) is Admin-only.
-- Access: Viewer (FORBIDDEN_ROW 50003).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_GetById
    @MeetingActionItemId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = m.ProjectId
    FROM app.MeetingActionItem AS ai
    LEFT JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId
    WHERE ai.MeetingActionItemId = @MeetingActionItemId AND ai.IsDeleted = 0
      AND (ai.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

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
           ai.[OnHoldReason],
           ai.SortOrder,
           ai.CreatedAtUtc,
           ai.UpdatedAtUtc,
           CAST(ai.RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingActionItem AS ai
    LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = ai.AssignedToStakeholderId
    WHERE ai.MeetingActionItemId = @MeetingActionItemId AND ai.IsDeleted = 0;
END;
GO
