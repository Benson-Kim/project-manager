-- usp_RiskIssue_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Project ownership check: @ActorUserId must reach the record's current project at Contributor
--   (FORBIDDEN_ROW 50003). Admin role bypass: an Admin actor skips the ProjectAssignee check.
-- ProjectId is immutable: the stored project is always kept; @ProjectId is accepted for the
--   action-layer form contract but ignored (prevents cross-project record relocation via a
--   forged payload — the rule usp_AssumptionConstraint_Update follows).
-- Dropdown values (ADR-0022): Category, Status, Priority, Impact and Probability must be live
--   options of their lists, or unchanged (VALIDATION 50004), and are stored as listed.
-- DueDate may not fall before DateIdentified (VALIDATION 50004), unless the pair is exactly what
--   is stored — so a record migrated with its dates inverted can still be edited.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: risks-issues (#14, ADR-0050).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_Update
    @RiskIssueId    INT,
    @ProjectId      INT,          -- accepted but ignored; ProjectId is immutable
    @Description    NVARCHAR(MAX)  = NULL,
    @Category       NVARCHAR(255)  = NULL,
    @DateIdentified DATETIME2      = NULL,
    @Status         NVARCHAR(255)  = NULL,
    @Priority       NVARCHAR(255)  = NULL,
    @Impact         NVARCHAR(255)  = NULL,
    @Probability    NVARCHAR(255)  = NULL,
    @MitigationPlan NVARCHAR(MAX)  = NULL,
    @Owner          NVARCHAR(255)  = NULL,
    @DueDate        DATETIME2      = NULL,
    @RowVer         BIGINT,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT,
            @CurrentCategory NVARCHAR(255), @CurrentStatus NVARCHAR(255),
            @CurrentPriority NVARCHAR(255), @CurrentImpact NVARCHAR(255),
            @CurrentProbability NVARCHAR(255),
            @CurrentIdentified DATETIME2, @CurrentDue DATETIME2;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId,
           @CurrentCategory = [Category], @CurrentStatus = [Status],
           @CurrentPriority = [Priority], @CurrentImpact = [Impact],
           @CurrentProbability = [Probability],
           @CurrentIdentified = [DateIdentified], @CurrentDue = [DueDate]
    FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'risks-issues:update', @AllowProjectless = 0;
    SET @ProjectId = @RowProjectId;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:RiskIssue was modified by someone else', 1;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.category', @Label = @Category OUTPUT,
         @CurrentLabel = @CurrentCategory;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.status', @Label = @Status OUTPUT,
         @CurrentLabel = @CurrentStatus;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.priority', @Label = @Priority OUTPUT,
         @CurrentLabel = @CurrentPriority;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.impact', @Label = @Impact OUTPUT,
         @CurrentLabel = @CurrentImpact;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.probability', @Label = @Probability OUTPUT,
         @CurrentLabel = @CurrentProbability;

    IF @DueDate < @DateIdentified
       AND (@CurrentIdentified IS NULL OR @CurrentDue IS NULL
            OR CAST(@DateIdentified AS DATE) <> CAST(@CurrentIdentified AS DATE)
            OR CAST(@DueDate AS DATE) <> CAST(@CurrentDue AS DATE))
        THROW 50004, N'VALIDATION:DueDate cannot be before DateIdentified', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT RiskIssueId, [ProjectId], [Description], [Category], [DateIdentified], [Status], [Priority], [Impact], [Probability], [MitigationPlan], [Owner], [DueDate]
         FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic update: RowVer in the WHERE predicate eliminates the TOCTOU window.
    UPDATE app.RiskIssue SET
        -- ProjectId intentionally omitted — immutable after creation.
        [Description] = @Description,
        [Category] = @Category,
        [DateIdentified] = @DateIdentified,
        [Status] = @Status,
        [Priority] = @Priority,
        [Impact] = @Impact,
        [Probability] = @Probability,
        [MitigationPlan] = @MitigationPlan,
        [Owner] = @Owner,
        [DueDate] = @DueDate,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;
        THROW 50002, N'CONFLICT:RiskIssue was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.RiskIssue', CAST(@RiskIssueId AS NVARCHAR(64)), @Before,
            (SELECT RiskIssueId, [ProjectId], [Description], [Category], [DateIdentified], [Status], [Priority], [Impact], [Probability], [MitigationPlan], [Owner], [DueDate]
             FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT RiskIssueId,
           [ProjectId],
           [Description],
           [Category],
           [DateIdentified],
           [Status],
           [Priority],
           [Impact],
           [Probability],
           [MitigationPlan],
           [Owner],
           [DueDate],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.RiskIssue
    WHERE RiskIssueId = @RiskIssueId;
END;
GO
