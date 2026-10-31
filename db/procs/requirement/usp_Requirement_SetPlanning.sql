-- usp_Requirement_SetPlanning — replace one requirement's acceptance criteria, estimate and owner
-- together (ADR-0052); answers with the row. All three are required: NULL clears that field, so an
-- omitted one can never reset silently. MoSCoW has its own proc (usp_Requirement_SetMoSCoW), and
-- the wording, type and links stay with usp_Requirement_Update.
-- The rules are usp_Requirement_AssertPlanning's, checked under the project lock.
-- Access: Contributor + requirements:update. CONFLICT 50002 on a stale RowVer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_SetPlanning
    @RequirementId      INT,
    @AcceptanceCriteria NVARCHAR(MAX),
    @EstimateDays       DECIMAL(6, 1),
    @OwnerStakeholderId INT,
    @RowVer             BIGINT,
    @ActorUserId        INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    SET @AcceptanceCriteria = NULLIF(LTRIM(RTRIM(@AcceptanceCriteria)), N'');

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    EXEC dbo.usp_Requirement_AssertPlanning
         @ProjectId = @RowProjectId, @AcceptanceCriteria = @AcceptanceCriteria,
         @EstimateDays = @EstimateDays, @OwnerStakeholderId = @OwnerStakeholderId;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT AcceptanceCriteria, EstimateDays, OwnerStakeholderId
         FROM app.Requirement WHERE RequirementId = @RequirementId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.Requirement SET
        AcceptanceCriteria = @AcceptanceCriteria,
        EstimateDays       = @EstimateDays,
        OwnerStakeholderId = @OwnerStakeholderId,
        UpdatedAtUtc       = SYSUTCDATETIME(),
        UpdatedBy          = @ActorUserId
    WHERE RequirementId = @RequirementId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Requirement not found', 1;
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Requirement', CAST(@RequirementId AS NVARCHAR(64)), @Before,
            (SELECT AcceptanceCriteria, EstimateDays, OwnerStakeholderId
             FROM app.Requirement WHERE RequirementId = @RequirementId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    EXEC dbo.usp_Requirement_GetById @RequirementId = @RequirementId, @ActorUserId = @ActorUserId;
END;
GO
