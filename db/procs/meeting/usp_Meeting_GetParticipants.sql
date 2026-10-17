-- usp_Meeting_GetParticipants — port of Access qryMeetingParticipants (module #10, ADR-0028): every
-- Guests (migration 033: StakeholderId null, GuestName / GuestOrganization set) are listed too,
--   labelled "Name - Organization"; StakeholderIsDeleted is 0 for them.
-- live participant of a meeting with its label and attended/apology state. Participants whose
-- stakeholder was deleted later stay listed (StakeholderIsDeleted = 1): the minutes keep history.
-- Label: "Name - Position, Organization" like qryMeetingAttendees (Position = OrgTitle,
--   Organization = DepartmentOrganization; empty parts are left out). No contact details.
-- Access: Viewer on the meeting's project (FORBIDDEN_ROW 50003); NOT_FOUND 50001 for a missing meeting.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetParticipants
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
           CASE WHEN mp.StakeholderId IS NULL THEN CONCAT(mp.GuestName, N' - ' + NULLIF(TRIM(mp.GuestOrganization), N'')) ELSE CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) END AS Label,
           mp.[IsApology],
           ISNULL(s.IsDeleted, 0) AS StakeholderIsDeleted,
           CAST(mp.RowVer AS BIGINT) AS RowVer
    FROM app.MeetingParticipant AS mp
    LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId
    WHERE mp.IsDeleted = 0
      AND mp.MeetingId = @MeetingId
    ORDER BY COALESCE(s.FirstName, mp.GuestName), s.LastName, mp.MeetingParticipantId;
END;
GO
