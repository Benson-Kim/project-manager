-- usp_Financial_GetSheet - everything the calculator needs for one financial (ADR-0029):
--   1. dbo.ufn_Financial_Row
--   2. live tax profiles in SortOrder, each with its rate steps as JSON [{fromFiscalYear, rate}]
--   3. live lines in section, SortOrder
--   4. typed amounts of those lines
--   5. live transactions of those lines, by date
--   6. live checklist documents in SortOrder (ADR-0030), with their live attachment count
--   7. the live attachments of those documents, newest first, shaped like usp_<Owner>_ListFiles
-- Access: Viewer on its project (usp_Financial_AssertAccess; NOT_FOUND 50001, FORBIDDEN_ROW 50003).
-- No transaction: a read that held shared locks under REPEATABLE READ blocked writers, and a
-- cancelled request left it open on the pooled connection (LESSONS 30). Pages re-read after
-- every write, so a write landing between two sets only shows on the next read.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_GetSheet
    @FinancialId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    SELECT * FROM dbo.ufn_Financial_Row(@FinancialId);

    SELECT p.FinancialTaxProfileId, p.[Name], p.Rate, p.SortOrder,
           ISNULL((SELECT r.FromFiscalYear AS fromFiscalYear, r.Rate AS rate
                   FROM app.FinancialTaxProfileRate AS r
                   WHERE r.FinancialTaxProfileId = p.FinancialTaxProfileId
                   ORDER BY r.FromFiscalYear
                   FOR JSON PATH), N'[]') AS Steps,
           CAST(p.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialTaxProfile AS p
    WHERE p.FinancialId = @FinancialId AND p.IsDeleted = 0
    ORDER BY p.SortOrder, p.FinancialTaxProfileId;

    SELECT FinancialLineId, [Section], [Description], CostCategory, FundingSource, Supplier,
           GlAccount, FinancialTaxProfileId, IsRecurrent, Comments, SortOrder,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.FinancialLine
    WHERE FinancialId = @FinancialId AND IsDeleted = 0
    ORDER BY CASE [Section] WHEN 'operating' THEN 1 WHEN 'capital' THEN 2 ELSE 3 END,
             SortOrder, FinancialLineId;

    SELECT a.FinancialLineId, a.FiscalYear, a.Amount
    FROM app.FinancialLineAmount AS a
    JOIN app.FinancialLine AS l ON l.FinancialLineId = a.FinancialLineId
    WHERE l.FinancialId = @FinancialId AND l.IsDeleted = 0
    ORDER BY a.FinancialLineId, a.FiscalYear;

    SELECT t.FinancialTransactionId, t.FinancialLineId, t.FiscalYear,
           CONVERT(CHAR(10), t.TransactionDate, 23) AS TransactionDate,
           t.Reference, t.[Description], t.Amount, t.TaxRate, CAST(t.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialTransaction AS t
    JOIN app.FinancialLine AS l ON l.FinancialLineId = t.FinancialLineId
    WHERE l.FinancialId = @FinancialId AND l.IsDeleted = 0 AND t.IsDeleted = 0
    ORDER BY t.TransactionDate, t.FinancialTransactionId;

    SELECT d.FinancialDocumentId, d.[Name], d.IsRequired, d.ReasonNotCreated, d.Suggestions, d.SortOrder,
           (SELECT COUNT(*) FROM app.FinancialDocumentFile AS l
            JOIN app.FileAttachment AS f ON f.FileAttachmentId = l.FileAttachmentId
            WHERE l.FinancialDocumentId = d.FinancialDocumentId AND f.IsDeleted = 0) AS FileCount,
           CAST(d.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialDocument AS d
    WHERE d.FinancialId = @FinancialId AND d.IsDeleted = 0
    ORDER BY d.SortOrder, d.FinancialDocumentId;

    SELECT l.FinancialDocumentId,
           f.FileAttachmentId,
           f.FileName,
           f.ContentType,
           f.SizeBytes,
           f.StorageLocation,
           f.CreatedAtUtc,
           u.DisplayName AS CreatedByName,
           CAST(f.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialDocumentFile AS l
    JOIN app.FinancialDocument AS d ON d.FinancialDocumentId = l.FinancialDocumentId
    JOIN app.FileAttachment AS f ON f.FileAttachmentId = l.FileAttachmentId
    LEFT JOIN auth.[User] AS u ON u.UserId = f.CreatedBy
    WHERE d.FinancialId = @FinancialId AND d.IsDeleted = 0 AND f.IsDeleted = 0
    ORDER BY f.CreatedAtUtc DESC, f.FileAttachmentId DESC;
END;
GO
