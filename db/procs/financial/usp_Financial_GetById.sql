-- usp_Financial_GetById — fetch one active app.Financial row; THROW 50001 when absent/soft-deleted.
-- Entity app.Financial (source: tblFinancials). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_GetById
    @FinancialId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Financial WHERE FinancialId = @FinancialId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

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
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
END;
GO
