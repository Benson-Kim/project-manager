-- usp_RiskIssue_Create — insert one app.RiskIssue row; audits in-transaction; returns the new row.
-- Project ownership check: @ActorUserId must reach the target project at Contributor (FORBIDDEN_ROW 50003).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- Dropdown values (ADR-0022): Category, Status, Priority, Impact and Probability must be live
--   options of their lists (VALIDATION 50004), and are stored as listed.
-- DueDate may not fall before DateIdentified (VALIDATION 50004) — the same rule the form applies.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: risks-issues (#14, ADR-0050).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_Create
    @ProjectId      INT,
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
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'risks-issues:create', @AllowProjectless = 0;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.category', @Label = @Category OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.status', @Label = @Status OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.priority', @Label = @Priority OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.impact', @Label = @Impact OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'risk-issue.probability', @Label = @Probability OUTPUT;

    IF @DueDate < @DateIdentified
        THROW 50004, N'VALIDATION:DueDate cannot be before DateIdentified', 1;

    BEGIN TRAN;

    INSERT INTO app.RiskIssue ([ProjectId], [Description], [Category], [DateIdentified], [Status], [Priority], [Impact], [Probability], [MitigationPlan], [Owner], [DueDate], CreatedBy)
    VALUES (@ProjectId, @Description, @Category, @DateIdentified, @Status, @Priority, @Impact, @Probability, @MitigationPlan, @Owner, @DueDate, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.RiskIssue', CAST(@Id AS NVARCHAR(64)),
            (SELECT RiskIssueId, [ProjectId], [Description], [Category], [DateIdentified], [Status], [Priority], [Impact], [Probability], [MitigationPlan], [Owner], [DueDate]
             FROM app.RiskIssue WHERE RiskIssueId = @Id
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
    WHERE RiskIssueId = @Id;
END;
GO
