-- usp_Financial_Create — insert one app.Financial row; audits in-transaction; returns the new row.
-- Entity app.Financial (source: tblFinancials). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_Create
    @ProjectId INT,
    @ProjectNumber INT = NULL,
    @Acquisition NVARCHAR(255) = NULL,
    @GlGrandLivre NVARCHAR(255) = NULL,
    @BudgetEnvelope NVARCHAR(255) = NULL,
    @Budget MONEY = NULL,
    @SpendBy NVARCHAR(255) = NULL,
    @RecurrentFees MONEY = NULL,
    @ContractTimeframe NVARCHAR(255) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.Financial ([ProjectId], [ProjectNumber], [Acquisition], [GlGrandLivre], [BudgetEnvelope], [Budget], [SpendBy], [RecurrentFees], [ContractTimeframe], CreatedBy)
    VALUES (@ProjectId, @ProjectNumber, @Acquisition, @GlGrandLivre, @BudgetEnvelope, @Budget, @SpendBy, @RecurrentFees, @ContractTimeframe, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Financial', CAST(@Id AS NVARCHAR(64)),
            (SELECT FinancialId, [ProjectId], [ProjectNumber], [Acquisition], [GlGrandLivre], [BudgetEnvelope], [Budget], [SpendBy], [RecurrentFees], [ContractTimeframe]
             FROM app.Financial WHERE FinancialId = @Id
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
    WHERE FinancialId = @Id;
END;
GO
