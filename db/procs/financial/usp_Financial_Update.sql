-- usp_Financial_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.Financial (source: tblFinancials). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_Update
    @FinancialId INT,
    @ProjectId INT,
    @ProjectNumber INT = NULL,
    @Acquisition NVARCHAR(255) = NULL,
    @GlGrandLivre NVARCHAR(255) = NULL,
    @BudgetEnvelope NVARCHAR(255) = NULL,
    @Budget MONEY = NULL,
    @SpendBy NVARCHAR(255) = NULL,
    @RecurrentFees MONEY = NULL,
    @ContractTimeframe NVARCHAR(255) = NULL,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Financial WHERE FinancialId = @FinancialId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Financial was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT FinancialId, [ProjectId], [ProjectNumber], [Acquisition], [GlGrandLivre], [BudgetEnvelope], [Budget], [SpendBy], [RecurrentFees], [ContractTimeframe]
         FROM app.Financial WHERE FinancialId = @FinancialId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Financial SET
        [ProjectId] = @ProjectId,
        [ProjectNumber] = @ProjectNumber,
        [Acquisition] = @Acquisition,
        [GlGrandLivre] = @GlGrandLivre,
        [BudgetEnvelope] = @BudgetEnvelope,
        [Budget] = @Budget,
        [SpendBy] = @SpendBy,
        [RecurrentFees] = @RecurrentFees,
        [ContractTimeframe] = @ContractTimeframe,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Financial', CAST(@FinancialId AS NVARCHAR(64)), @Before,
            (SELECT FinancialId, [ProjectId], [ProjectNumber], [Acquisition], [GlGrandLivre], [BudgetEnvelope], [Budget], [SpendBy], [RecurrentFees], [ContractTimeframe]
             FROM app.Financial WHERE FinancialId = @FinancialId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT FinancialId,
           [ProjectId],
           [ProjectNumber],
           [Acquisition],
           [GlGrandLivre],
           [BudgetEnvelope],
           [Budget],
           [SpendBy],
           [RecurrentFees],
           [ContractTimeframe],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Financial
    WHERE FinancialId = @FinancialId;
END;
GO
