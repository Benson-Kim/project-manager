-- usp_Decision_Update — update one app.Decision with rowversion concurrency (ADR-0055).
-- Project ownership check: @ActorUserId must reach the record's project at Contributor
--   (FORBIDDEN_ROW 50003). Admin role bypass: an Admin actor skips the ProjectAssignee check.
-- The two link sets use the Set-flag pair: a datasheet cell edit sends no set at all, so
--   @ImpactedAreasSet / @StakeholderIdsSet stay 0 and the links are left exactly as they are.
--   The form sends both flags as 1 and owns the whole set.
-- A decision may not supersede itself (CK_Decision_NotSelf) nor close a loop: the chain from the
--   proposed target is walked under the row lock, so two sessions cannot build a cycle between them.
-- Entity app.Decision (migration 057). Module: decisions (ADR-0055, BL36).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Decision_Update
    @DecisionId             INT,
    @RowVer                 BIGINT,
    @Title                  NVARCHAR(255),
    @DateLogged             DATETIME2 = NULL,
    @OwnerStakeholderId     INT = NULL,
    @Status                 NVARCHAR(50) = NULL,
    @ProblemContext         NVARCHAR(MAX) = NULL,
    @OptionsConsidered      NVARCHAR(MAX) = NULL,
    @Rationale              NVARCHAR(MAX) = NULL,
    @NextSteps              NVARCHAR(MAX) = NULL,
    @SupersededByDecisionId INT = NULL,
    @ImpactedAreasSet       BIT = 0,
    @ImpactedAreas          NVARCHAR(MAX) = NULL,
    @StakeholderIdsSet      BIT = 0,
    @StakeholderIds         NVARCHAR(MAX) = NULL,
    @ActorUserId            INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentStatus NVARCHAR(50);
    SELECT @RowProjectId = ProjectId, @CurrentStatus = [Status]
    FROM app.Decision WHERE DecisionId = @DecisionId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Decision not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'decisions:update', @AllowProjectless = 0;

    IF NULLIF(TRIM(@Title), N'') IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    -- @CurrentStatus keeps a retired value on a record nobody has changed (ADR-0022).
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'decision.status', @Label = @Status OUTPUT, @CurrentLabel = @CurrentStatus;

    IF @SupersededByDecisionId = @DecisionId
        THROW 50004, N'VALIDATION:A decision cannot supersede itself', 1;

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    BEGIN TRAN;

    -- RowVer check INSIDE the transaction so the concurrency guard is atomic with the UPDATE.
    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Decision
         WHERE DecisionId = @DecisionId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
    BEGIN
        ROLLBACK;
        THROW 50001, N'NOT_FOUND:Decision not found', 1;
    END
    IF @CurrentVer <> @RowVer
    BEGIN
        ROLLBACK;
        THROW 50002, N'CONFLICT:Decision was modified by someone else', 1;
    END

    IF @OwnerStakeholderId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.Stakeholder
                       WHERE StakeholderId = @OwnerStakeholderId
                         AND ProjectId = @RowProjectId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:The owner was not found', 1;

    IF @SupersededByDecisionId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Decision WITH (UPDLOCK, HOLDLOCK)
                       WHERE DecisionId = @SupersededByDecisionId
                         AND ProjectId = @RowProjectId AND IsDeleted = 0)
            THROW 50004, N'VALIDATION:The superseding decision was not found', 1;

        -- The existing chain is acyclic, so walking it terminates; the cap turns a chain that
        -- somehow looped into a visible error rather than a hung request.
        DECLARE @Cycle BIT = 0;
        WITH chain AS (
            SELECT d.DecisionId, d.SupersededByDecisionId
            FROM app.Decision AS d
            WHERE d.DecisionId = @SupersededByDecisionId
            UNION ALL
            SELECT n.DecisionId, n.SupersededByDecisionId
            FROM app.Decision AS n
            JOIN chain AS c ON n.DecisionId = c.SupersededByDecisionId
        )
        SELECT @Cycle = 1 FROM chain WHERE DecisionId = @DecisionId
        OPTION (MAXRECURSION 1000);

        IF @Cycle = 1
            THROW 50004, N'VALIDATION:That would make two decisions supersede each other', 1;
    END

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT DecisionId, [ProjectId], DecisionNumber, [Title], [DateLogged],
                [OwnerStakeholderId], [Status], [ProblemContext], [OptionsConsidered],
                [Rationale], [NextSteps], [SupersededByDecisionId]
         FROM app.Decision WHERE DecisionId = @DecisionId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Decision SET
        [Title]                  = TRIM(@Title),
        [DateLogged]             = ISNULL(@DateLogged, [DateLogged]),
        [OwnerStakeholderId]     = @OwnerStakeholderId,
        [Status]                 = @Status,
        [ProblemContext]         = @ProblemContext,
        [OptionsConsidered]      = @OptionsConsidered,
        [Rationale]              = @Rationale,
        [NextSteps]              = @NextSteps,
        [SupersededByDecisionId] = @SupersededByDecisionId,
        UpdatedAtUtc             = @Now,
        UpdatedBy                = @ActorUserId
    WHERE DecisionId = @DecisionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Decision WHERE DecisionId = @DecisionId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Decision not found', 1;
        THROW 50002, N'CONFLICT:Decision was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Decision', CAST(@DecisionId AS NVARCHAR(64)), @Before,
            (SELECT DecisionId, [ProjectId], DecisionNumber, [Title], [DateLogged],
                    [OwnerStakeholderId], [Status], [ProblemContext], [OptionsConsidered],
                    [Rationale], [NextSteps], [SupersededByDecisionId]
             FROM app.Decision WHERE DecisionId = @DecisionId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    IF @ImpactedAreasSet = 1
        EXEC dbo.usp_Decision_ReplaceImpactedAreas
             @DecisionId = @DecisionId, @Labels = @ImpactedAreas, @ActorUserId = @ActorUserId;
    IF @StakeholderIdsSet = 1
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
