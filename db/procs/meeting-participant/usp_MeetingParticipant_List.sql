-- usp_MeetingParticipant_List — the live participants of one meeting with their labels (module #10,
-- Guests (migration 033: StakeholderId null, GuestName / GuestOrganization set) are listed too,
--   labelled "Name - Organization"; StakeholderIsDeleted is 0 for them.
-- ADR-0028); the same rows as usp_Meeting_GetParticipants plus timestamps. A child collection: no
-- paging or search. Labels: "Name - Position, Organization"; no contact details.
-- Access: Viewer on the meeting's project (FORBIDDEN_ROW 50003); NOT_FOUND 50001 for a missing meeting.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_List
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
           mp.CreatedAtUtc,
           mp.UpdatedAtUtc,
           CAST(mp.RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingParticipant AS mp
    LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId
    WHERE mp.IsDeleted = 0
      AND mp.MeetingId = @MeetingId
    ORDER BY COALESCE(s.FirstName, mp.GuestName), s.LastName, mp.MeetingParticipantId;
END;
GO
