-- ufn_Financial_Row - the one shape every financial proc returns and audits (ADR-0029): the
-- breakdown fields of PPTX slide 2 and the calculator settings. Live rows only.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_Financial_Row (@FinancialId INT)
RETURNS TABLE
AS
RETURN
    SELECT FinancialId,
           ProjectId,
           Title,
           TemplateName,
           ProjectNumber,
           Acquisition,
           GlGrandLivre,
           BudgetEnvelope,
           CAST(Budget AS DECIMAL(19,2)) AS Budget,
           BudgetIncludesTax,
           SpendBy,
           CAST(RecurrentFees AS DECIMAL(19,2)) AS RecurrentFees,
           ContractTimeframe,
           FirstFiscalYear,
           HorizonYears,
           FiscalYearStartMonth,
           EscalationRate,
           FlagThresholdRate,
           CostCategories,
           FundingSources,
           CurrencyCode,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Financial
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
GO
