-- usp_Meeting_GetAttendees — port of Access qryMeetingAttendees (module #10, ADR-0028): the meeting's
-- Guests (migration 033: StakeholderId null, GuestName / GuestOrganization set) are listed too,
--   labelled "Name - Organization"; StakeholderIsDeleted is 0 for them.
-- live participants who attended (IsApology = 0), labelled "Name - Position, Organization" as in
-- usp_Meeting_GetParticipants. Feeds the printed minutes (subrptMeetingAttendees).
-- Access: Viewer on the meeting's project (FORBIDDEN_ROW 50003); NOT_FOUND 50001 for a missing meeting.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetAttendees
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
           mp.GuestName,
           mp.GuestOrganization,
           CASE WHEN mp.StakeholderId IS NULL THEN CONCAT(mp.GuestName, N' - ' + NULLIF(TRIM(mp.GuestOrganization), N'')) ELSE CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) END AS Label
    FROM app.MeetingParticipant AS mp
    LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId
    WHERE mp.IsDeleted = 0
      AND mp.MeetingId = @MeetingId
      AND mp.[IsApology] = 0
    ORDER BY COALESCE(s.FirstName, mp.GuestName), s.LastName, mp.MeetingParticipantId;
END;
GO
