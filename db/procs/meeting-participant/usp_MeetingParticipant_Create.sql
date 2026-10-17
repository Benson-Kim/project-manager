-- usp_MeetingParticipant_Create — add one stakeholder to a meeting as attended (IsApology = 0) or
-- Guests (migration 033) are saved through usp_MeetingParticipant_Set; this proc takes a stakeholder,
--   but labels and returns the row like every participant read.
-- apology (1) (module #10, ADR-0028); audits in-transaction; returns the new row with ProjectId.
-- The stakeholder must be a live stakeholder of the meeting's project (VALIDATION 50004) and not
-- listed already (DUPLICATE 50005; UX_MeetingParticipant_Meeting_Stakeholder backs it). The meeting
-- row is locked so the duplicate check and the insert cannot interleave with another add; the
-- stakeholder row is checked under UPDLOCK, HOLDLOCK inside the transaction, so a concurrent
-- usp_Stakeholder_Delete either fails the check or waits for the insert.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:create, ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_Create
    @MeetingId     INT,
    @StakeholderId INT,
    @IsApology     BIT = 0,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @MeetingId IS NULL OR @StakeholderId IS NULL
        THROW 50004, N'VALIDATION:MeetingId and StakeholderId are required', 1;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:create', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)
    WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    IF NOT EXISTS (SELECT 1 FROM app.Stakeholder AS s WITH (UPDLOCK, HOLDLOCK)
                   WHERE s.StakeholderId = @StakeholderId AND s.ProjectId = @RowProjectId AND s.IsDeleted = 0)
        THROW 50004, N'VALIDATION:The participant must be a stakeholder of the meeting''s project', 1;

    IF EXISTS (SELECT 1 FROM app.MeetingParticipant
               WHERE MeetingId = @MeetingId AND StakeholderId = @StakeholderId AND IsDeleted = 0)
        THROW 50005, N'DUPLICATE:This stakeholder is already a participant', 1;

    INSERT INTO app.MeetingParticipant ([MeetingId], [StakeholderId], [IsApology], CreatedBy)
    VALUES (@MeetingId, @StakeholderId, ISNULL(@IsApology, 0), @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingParticipant', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingParticipantId, [MeetingId], [StakeholderId], GuestName, GuestOrganization, [IsApology]
             FROM app.MeetingParticipant WHERE MeetingParticipantId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

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
    WHERE mp.MeetingParticipantId = @Id;
END;
GO
