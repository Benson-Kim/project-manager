-- usp_MeetingParticipant_Update — switch a participant between attended (IsApology = 0) and apology
-- (1) with rowversion concurrency (50002 CONFLICT, checked in the transaction) and an in-transaction
-- audit row (module #10, ADR-0028). The meeting and the stakeholder are immutable. The meeting row is
-- locked (UPDLOCK, HOLDLOCK) like usp_MeetingParticipant_Set, so a switch cannot land between a set's
-- stamp check and its writes.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_Update
    @MeetingParticipantId INT,
    @IsApology            BIT,
    @RowVer               BIGINT,
    @ActorUserId          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = mp.MeetingId
    FROM app.MeetingParticipant AS mp
    LEFT JOIN app.Meeting AS m ON m.MeetingId = mp.MeetingId
    WHERE mp.MeetingParticipantId = @MeetingParticipantId AND mp.IsDeleted = 0
      AND (mp.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingParticipant not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF @IsApology IS NULL
        THROW 50004, N'VALIDATION:IsApology is required', 1;

    BEGIN TRAN;

    IF @MeetingId IS NOT NULL
    BEGIN
        DECLARE @Locked INT;
        SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK) WHERE MeetingId = @MeetingId;
    END;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingParticipantId, [MeetingId], [StakeholderId], [IsApology]
         FROM app.MeetingParticipant WHERE MeetingParticipantId = @MeetingParticipantId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingParticipant SET
        [IsApology]  = @IsApology,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingParticipant
                       WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingParticipant not found', 1;
        THROW 50002, N'CONFLICT:MeetingParticipant was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingParticipant', CAST(@MeetingParticipantId AS NVARCHAR(64)), @Before,
            (SELECT MeetingParticipantId, [MeetingId], [StakeholderId], [IsApology]
             FROM app.MeetingParticipant WHERE MeetingParticipantId = @MeetingParticipantId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT mp.MeetingParticipantId,
           mp.MeetingId,
           mp.StakeholderId,
           CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) AS Label,
           mp.[IsApology],
           s.IsDeleted AS StakeholderIsDeleted,
           mp.CreatedAtUtc,
           mp.UpdatedAtUtc,
           CAST(mp.RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingParticipant AS mp
    JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId
    WHERE mp.MeetingParticipantId = @MeetingParticipantId;
END;
GO
