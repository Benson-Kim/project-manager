-- ufn_FinancialLine_Row - the shape every budget-line proc returns and audits (ADR-0029), with
-- its typed amounts as a JSON array [{"fiscalYear": 2023, "amount": 350.00}]. Live lines only.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_FinancialLine_Row (@FinancialLineId INT)
RETURNS TABLE
AS
RETURN
    SELECT l.FinancialLineId,
           l.FinancialId,
           l.[Section],
           l.[Description],
           l.CostCategory,
           l.FundingSource,
           l.Supplier,
           l.GlAccount,
           l.FinancialTaxProfileId,
           l.IsRecurrent,
           l.Comments,
           l.SortOrder,
           ISNULL((SELECT a.FiscalYear AS fiscalYear, a.Amount AS amount
                   FROM app.FinancialLineAmount AS a
                   WHERE a.FinancialLineId = l.FinancialLineId
                   ORDER BY a.FiscalYear
                   FOR JSON PATH), N'[]') AS Amounts,
           CAST(l.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialLine AS l
    WHERE l.FinancialLineId = @FinancialLineId AND l.IsDeleted = 0;
GO
