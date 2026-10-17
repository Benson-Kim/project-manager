-- usp_MeetingAgendaItem_List — the live agenda items of one meeting, in agenda order (module #10,
-- ADR-0028). A child collection, not a DataView list: no paging or search (the workspace reads
-- usp_Meeting_GetWorkspace).
-- Access: Viewer on the meeting's project (FORBIDDEN_ROW 50003); NOT_FOUND 50001 for a missing meeting.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_List
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

    SELECT MeetingAgendaItemId,
           [MeetingId],
           [AgendaItem],
           SortOrder,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingAgendaItem
    WHERE MeetingId = @MeetingId AND IsDeleted = 0
    ORDER BY SortOrder, MeetingAgendaItemId;
END;
GO
