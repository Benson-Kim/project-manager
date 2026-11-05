-- usp_Decision_Create — insert one app.Decision and return the new row (ADR-0055).
-- Project ownership check: @ActorUserId must reach @ProjectId at Contributor (FORBIDDEN_ROW 50003).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- DecisionNumber is the project's next free number, taken while the project row is held
--   (UPDLOCK, HOLDLOCK) so two sessions cannot claim the same one. Numbers are never reused: a
--   deleted decision keeps its number, because DEC-004 in a set of minutes means one decision.
-- The impacted areas and the consulted stakeholders are written by their own internal procs
--   inside this transaction, so a decision and its links commit together or not at all.
-- Entity app.Decision (migration 057). Module: decisions (ADR-0055, BL36).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Decision_Create
    @ProjectId              INT,
    @Title                  NVARCHAR(255),
    @DateLogged             DATETIME2 = NULL,
    @OwnerStakeholderId     INT = NULL,
    @Status                 NVARCHAR(50) = NULL,
    @ProblemContext         NVARCHAR(MAX) = NULL,
    @OptionsConsidered      NVARCHAR(MAX) = NULL,
    @Rationale              NVARCHAR(MAX) = NULL,
    @NextSteps              NVARCHAR(MAX) = NULL,
    @SupersededByDecisionId INT = NULL,
    @ImpactedAreas          NVARCHAR(MAX) = N'[]',
    @StakeholderIds         NVARCHAR(MAX) = N'[]',
    @ActorUserId            INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'decisions:create', @AllowProjectless = 0;

    IF NULLIF(TRIM(@Title), N'') IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    EXEC dbo.usp_LookupList_AssertLabel @ListKey = N'decision.status', @Label = @Status OUTPUT;

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK)
    WHERE ProjectId = @ProjectId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    -- Deleted rows count: UQ_Decision_Number is not filtered, so a number is spent for good.
    DECLARE @DecisionNumber INT =
        ISNULL((SELECT MAX(DecisionNumber) FROM app.Decision WHERE ProjectId = @ProjectId), 0) + 1;

    IF @OwnerStakeholderId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.Stakeholder
                       WHERE StakeholderId = @OwnerStakeholderId
                         AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:The owner was not found', 1;

    IF @SupersededByDecisionId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.Decision
                       WHERE DecisionId = @SupersededByDecisionId
                         AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:The superseding decision was not found', 1;

    INSERT INTO app.Decision
        ([ProjectId], DecisionNumber, [Title], [DateLogged], [OwnerStakeholderId], [Status],
         [ProblemContext], [OptionsConsidered], [Rationale], [NextSteps], [SupersededByDecisionId],
         CreatedAtUtc, CreatedBy)
    VALUES
        (@ProjectId, @DecisionNumber, TRIM(@Title), ISNULL(@DateLogged, @Now), @OwnerStakeholderId,
         @Status, @ProblemContext, @OptionsConsidered, @Rationale, @NextSteps,
         @SupersededByDecisionId, @Now, @ActorUserId);

    DECLARE @DecisionId INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Decision', CAST(@DecisionId AS NVARCHAR(64)),
            (SELECT DecisionId, [ProjectId], DecisionNumber, [Title], [DateLogged],
                    [OwnerStakeholderId], [Status], [ProblemContext], [OptionsConsidered],
                    [Rationale], [NextSteps], [SupersededByDecisionId]
             FROM app.Decision WHERE DecisionId = @DecisionId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    EXEC dbo.usp_Decision_ReplaceImpactedAreas
         @DecisionId = @DecisionId, @Labels = @ImpactedAreas, @ActorUserId = @ActorUserId;
    EXEC dbo.usp_Decision_ReplaceStakeholders
         @DecisionId = @DecisionId, @Ids = @StakeholderIds, @ActorUserId = @ActorUserId;

    COMMIT;

    SELECT d.DecisionId,
           d.[ProjectId],
           d.DecisionNumber,
           d.[Title],
           d.[DateLogged],
           d.[OwnerStakeholderId],
           d.[Status],
           d.[ProblemContext],
           d.[OptionsConsidered],
           d.[Rationale],
           d.[NextSteps],
           d.[SupersededByDecisionId],
           (SELECT a.Label AS label FROM app.DecisionImpactedArea AS a
            WHERE a.DecisionId = d.DecisionId ORDER BY a.Label
            FOR JSON PATH) AS ImpactedAreas,
           (SELECT s.StakeholderId AS id FROM app.DecisionStakeholder AS s
            WHERE s.DecisionId = d.DecisionId ORDER BY s.StakeholderId
            FOR JSON PATH) AS ConsultedStakeholderIds,
           d.CreatedAtUtc,
           d.UpdatedAtUtc,
           CAST(d.RowVer AS BIGINT) AS RowVer
    FROM app.Decision AS d
    WHERE d.DecisionId = @DecisionId;
END;
GO
