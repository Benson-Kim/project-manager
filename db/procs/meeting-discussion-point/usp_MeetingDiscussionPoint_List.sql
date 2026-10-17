-- usp_MeetingDiscussionPoint_List — the live discussion points of one agenda item, in order (module
-- #10, ADR-0028). A child collection: no paging or search. DiscussionPoint is rich text (ADR-0025).
-- The project is found through agenda item -> meeting; NOT_FOUND 50001 for a missing agenda item.
-- Access: Viewer (FORBIDDEN_ROW 50003).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_List
    @AgendaItemId INT,
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = a.MeetingId
    FROM app.MeetingAgendaItem AS a
    LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
    WHERE a.MeetingAgendaItemId = @AgendaItemId AND a.IsDeleted = 0
      AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT MeetingDiscussionPointId,
           [AgendaItemId],
           [DiscussionPoint],
           SortOrder,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           @MeetingId AS MeetingId,
           @RowProjectId AS ProjectId
    FROM app.MeetingDiscussionPoint
    WHERE AgendaItemId = @AgendaItemId AND IsDeleted = 0
    ORDER BY SortOrder, MeetingDiscussionPointId;
END;
GO
