-- usp_MeetingDiscussionPoint_GetById — one live discussion point (module #10, ADR-0028).
-- The project is found through agenda item -> meeting; a point under a deleted agenda item or
-- meeting is NOT_FOUND (50001). Access: Viewer (FORBIDDEN_ROW 50003).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_GetById
    @MeetingDiscussionPointId INT,
    @ActorUserId              INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = a.MeetingId
    FROM app.MeetingDiscussionPoint AS dp
    JOIN app.MeetingAgendaItem AS a ON a.MeetingAgendaItemId = dp.AgendaItemId AND a.IsDeleted = 0
    LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
    WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId AND dp.IsDeleted = 0
      AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;

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
    WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0;
END;
GO
