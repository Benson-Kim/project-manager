-- usp_RiskIssue_Create — insert one app.RiskIssue row; audits in-transaction; returns the new row.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_Create
    @ProjectId INT,
    @Description NVARCHAR(MAX) = NULL,
    @Category NVARCHAR(255) = NULL,
    @DateIdentified DATETIME2 = NULL,
    @Status NVARCHAR(255) = NULL,
    @Priority NVARCHAR(255) = NULL,
    @Impact NVARCHAR(255) = NULL,
    @Probability NVARCHAR(255) = NULL,
    @MitigationPlan NVARCHAR(MAX) = NULL,
    @Owner NVARCHAR(255) = NULL,
    @DueDate DATETIME2 = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
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
