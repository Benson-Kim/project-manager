-- ufn_FinancialDocument_Row - the one shape the document procs return and audit (ADR-0030):
-- the checklist row and its live attachment count. Live rows only.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_FinancialDocument_Row (@FinancialDocumentId INT)
RETURNS TABLE
AS
RETURN
    SELECT d.FinancialDocumentId,
           d.FinancialId,
           d.[Name],
           d.IsRequired,
           d.ReasonNotCreated,
           d.Suggestions,
           d.SortOrder,
           (SELECT COUNT(*) FROM app.FinancialDocumentFile AS l
            JOIN app.FileAttachment AS f ON f.FileAttachmentId = l.FileAttachmentId
            WHERE l.FinancialDocumentId = d.FinancialDocumentId AND f.IsDeleted = 0) AS FileCount,
           d.CreatedAtUtc,
           d.UpdatedAtUtc,
           CAST(d.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialDocument AS d
    WHERE d.FinancialDocumentId = @FinancialDocumentId AND d.IsDeleted = 0;
GO
