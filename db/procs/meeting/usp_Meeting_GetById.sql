-- usp_Meeting_GetById — one live app.Meeting row (module #10, ADR-0028).
-- THROW 50001 NOT_FOUND when absent or deleted; the actor needs Viewer on its project
-- (dbo.usp_Project_AssertAccess, FORBIDDEN_ROW 50003). A meeting without a project is Admin-only.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetById
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

    SELECT MeetingId,
           [ProjectId],
           [Subject],
           [Objective],
           [DateReceived],
           [Description],
           [Location],
           [StartDate],
           [StartTime],
           [EndTime],
           [Conclusion],
           [NextMeeting],
           [FollowupAction],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Meeting
    WHERE MeetingId = @MeetingId AND IsDeleted = 0;
END;
GO
