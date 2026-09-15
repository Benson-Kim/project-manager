-- usp_RiskIssue_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_Update
    @RiskIssueId INT,
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
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:RiskIssue was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT RiskIssueId, [ProjectId], [Description], [Category], [DateIdentified], [Status], [Priority], [Impact], [Probability], [MitigationPlan], [Owner], [DueDate]
         FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.RiskIssue SET
        [ProjectId] = @ProjectId,
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
    WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0;

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
