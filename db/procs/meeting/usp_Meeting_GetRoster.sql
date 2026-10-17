-- usp_Meeting_GetRoster — the participant panel's list (module #10, checklist rows 13 and 54,
-- ADR-0028 amendment of 2026-10-14): every live stakeholder of the meeting's project with their
-- state at this meeting, then the meeting's participants who are no longer live stakeholders of
-- the project, kept for history. One row (execProc reads a single recordset):
--   ParticipantsStamp  read BEFORE the roster, as usp_Meeting_GetWorkspace computes it: a save sent
--                      back with it from usp_MeetingParticipant_Set never overwrites a change made
--                      after this read (CONFLICT 50002 instead);
--   RosterJson         [{StakeholderId, Label, MeetingParticipantId, IsApology, IsHistorical}];
--                      MeetingParticipantId and IsApology are null for a stakeholder who is not
--                      invited. IsHistorical = 1 marks a participant whose stakeholder was deleted
--                      (or is not on the project): Set leaves those rows as they are, so the panel
--                      shows them read-only, after the live stakeholders. Each part is in name order.
-- The meeting's participants are always listed; the other stakeholders fill what is left of 1000
--   places (Set's limit), so a save from a cut list never uninvites a participant the panel did not
--   show. A meeting with more than 1000 participants lists them all: the save then exceeds Set's
--   limit and is VALIDATION, never a silent uninvite.
-- Label: "Name - Position, Organization" like usp_Meeting_GetParticipants. No contact details.
-- Access: Viewer on the meeting's project (FORBIDDEN_ROW 50003); NOT_FOUND 50001 for a missing meeting.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetRoster
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

    DECLARE @ParticipantsStamp BIGINT =
        ISNULL((SELECT MAX(CAST(p.RowVer AS BIGINT)) FROM app.MeetingParticipant AS p
                WHERE p.MeetingId = @MeetingId), 0);

    WITH People AS (
        SELECT s.StakeholderId, s.FirstName, s.LastName,
               CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) AS Label,
               mp.MeetingParticipantId, mp.IsApology, CAST(0 AS BIT) AS IsHistorical
        FROM app.Stakeholder AS s
        LEFT JOIN app.MeetingParticipant AS mp
            ON mp.StakeholderId = s.StakeholderId AND mp.MeetingId = @MeetingId AND mp.IsDeleted = 0
        WHERE s.ProjectId = @RowProjectId AND s.IsDeleted = 0
        UNION ALL
        SELECT s.StakeholderId, s.FirstName, s.LastName,
               CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) AS Label,
               mp.MeetingParticipantId, mp.IsApology, CAST(1 AS BIT) AS IsHistorical
        FROM app.MeetingParticipant AS mp
        JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId
        WHERE mp.MeetingId = @MeetingId AND mp.IsDeleted = 0
          AND NOT EXISTS (SELECT 1 FROM app.Stakeholder AS live
                          WHERE live.StakeholderId = mp.StakeholderId
                            AND live.ProjectId = @RowProjectId AND live.IsDeleted = 0)
    ),
    Picked AS (
        SELECT People.*,
               ROW_NUMBER() OVER (ORDER BY CASE WHEN MeetingParticipantId IS NULL THEN 1 ELSE 0 END,
                                           FirstName, LastName, StakeholderId) AS Pick
        FROM People
    )
    SELECT @RowProjectId AS ProjectId,
           @MeetingId AS MeetingId,
           @ParticipantsStamp AS ParticipantsStamp,
           (SELECT r.StakeholderId, r.Label, r.MeetingParticipantId, r.IsApology, r.IsHistorical
            FROM Picked AS r
            WHERE r.MeetingParticipantId IS NOT NULL OR r.Pick <= 1000
            ORDER BY r.IsHistorical, r.FirstName, r.LastName, r.StakeholderId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS RosterJson;
END;
GO
