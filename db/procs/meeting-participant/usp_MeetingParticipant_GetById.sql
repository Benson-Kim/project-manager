-- usp_MeetingParticipant_GetById — one live participant with its label (module #10, ADR-0028).
-- Guests (migration 033: StakeholderId null, GuestName / GuestOrganization set) are listed too,
--   labelled "Name - Organization"; StakeholderIsDeleted is 0 for them.
-- The project is found through the meeting; a participant of a deleted meeting is NOT_FOUND (50001),
-- one without a meeting (Access orphan) is Admin-only. Access: Viewer (FORBIDDEN_ROW 50003).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_GetById
    @MeetingParticipantId INT,
    @ActorUserId          INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = m.ProjectId
    FROM app.MeetingParticipant AS mp
    LEFT JOIN app.Meeting AS m ON m.MeetingId = mp.MeetingId
    WHERE mp.MeetingParticipantId = @MeetingParticipantId AND mp.IsDeleted = 0
      AND (mp.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingParticipant not found', 1;

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
    WHERE mp.MeetingParticipantId = @MeetingParticipantId AND mp.IsDeleted = 0;
END;
GO
