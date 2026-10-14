-- usp_MeetingAgendaItem_GetById — one live agenda item (module #10, ADR-0028).
-- The project is found through the meeting; an item of a deleted meeting is NOT_FOUND (50001), and
-- one without a meeting (Access orphan) is Admin-only. Access: Viewer (FORBIDDEN_ROW 50003).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_GetById
    @MeetingAgendaItemId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = m.ProjectId
    FROM app.MeetingAgendaItem AS a
    LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
    WHERE a.MeetingAgendaItemId = @MeetingAgendaItemId AND a.IsDeleted = 0
      AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT MeetingAgendaItemId,
           [MeetingId],
           [AgendaItem],
           SortOrder,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingAgendaItem
    WHERE MeetingAgendaItemId = @MeetingAgendaItemId AND IsDeleted = 0;
END;
GO
