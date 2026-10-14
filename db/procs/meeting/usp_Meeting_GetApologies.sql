-- usp_Meeting_GetApologies — port of Access qryMeetingApologies (module #10, ADR-0028): the meeting's
-- live participants who sent apologies (IsApology = 1), labelled "Name - Position, Organization" as
-- in usp_Meeting_GetParticipants. Feeds the printed minutes (subrptMeetingApologies).
-- Access: Viewer on the meeting's project (FORBIDDEN_ROW 50003); NOT_FOUND 50001 for a missing meeting.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetApologies
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

    SELECT mp.MeetingParticipantId,
           mp.MeetingId,
           mp.StakeholderId,
           CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) AS Label
    FROM app.MeetingParticipant AS mp
    JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId
    WHERE mp.IsDeleted = 0
      AND mp.MeetingId = @MeetingId
      AND mp.[IsApology] = 1
    ORDER BY s.FirstName, s.LastName, mp.MeetingParticipantId;
END;
GO
