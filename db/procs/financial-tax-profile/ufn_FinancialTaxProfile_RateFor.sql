-- ufn_FinancialTaxProfile_RateFor - the rate a tax profile applies in one fiscal year (ADR-0029
-- amendment): the latest step from that year or before, else the profile's own rate. One row,
-- or none for a missing or deleted profile (callers ISNULL it to 0: no tax).
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_FinancialTaxProfile_RateFor (@FinancialTaxProfileId INT, @FiscalYear SMALLINT)
RETURNS TABLE
AS
RETURN
    SELECT ISNULL((SELECT TOP (1) r.Rate
                   FROM app.FinancialTaxProfileRate AS r
                   WHERE r.FinancialTaxProfileId = p.FinancialTaxProfileId
                     AND r.FromFiscalYear <= @FiscalYear
                   ORDER BY r.FromFiscalYear DESC), p.Rate) AS Rate
    FROM app.FinancialTaxProfile AS p
    WHERE p.FinancialTaxProfileId = @FinancialTaxProfileId AND p.IsDeleted = 0;
GO
