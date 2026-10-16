-- ufn_FinancialTransaction_Row - the shape every transaction proc returns and audits (ADR-0029).
-- TransactionDate as 'YYYY-MM-DD' text: a calendar date, never shifted by a time zone.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_FinancialTransaction_Row (@FinancialTransactionId INT)
RETURNS TABLE
AS
RETURN
    SELECT t.FinancialTransactionId,
           t.FinancialLineId,
           l.FinancialId,
           t.FiscalYear,
           CONVERT(CHAR(10), t.TransactionDate, 23) AS TransactionDate,
           t.Reference,
           t.[Description],
           t.Amount,
           t.TaxRate,
           CAST(t.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialTransaction AS t
    JOIN app.FinancialLine AS l ON l.FinancialLineId = t.FinancialLineId
    WHERE t.FinancialTransactionId = @FinancialTransactionId AND t.IsDeleted = 0;
GO
