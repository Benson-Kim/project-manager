-- Seed app.FinancialDocumentType — the 9 MSSS document types recovered from tblFinancialDocuments
-- (docs/source/analysis/access-database.md §4; original — partly misspelt — values preserved verbatim).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.FinancialDocumentType ON;

INSERT INTO app.FinancialDocumentType (FinancialDocumentTypeId, DocumentType, SortOrder)
SELECT s.*
FROM (VALUES
    (1, N'DA', 1),
    (2, N'DAS', 2),
    (3, N'Demande de Signature', 3),
    (4, N'Dossier d''orpportunite', 4),
    (5, N'Appel d''offer/Call for Tender', 5),
    (6, N'Montage Financier', 6),
    (7, N'Requisation', 7),
    (8, N'A1', 8),
    (9, N'Signed Direct Contract', 9)
) AS s (FinancialDocumentTypeId, DocumentType, SortOrder)
WHERE NOT EXISTS (SELECT 1 FROM app.FinancialDocumentType t
                  WHERE t.FinancialDocumentTypeId = s.FinancialDocumentTypeId);

SET IDENTITY_INSERT app.FinancialDocumentType OFF;
GO
