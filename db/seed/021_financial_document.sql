-- Seed app.FinancialDocument — ALL rows from docs/source/analysis/access-database.md §4 (tblProjectFinancialDocuments).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.FinancialDocument ON;

INSERT INTO app.FinancialDocument ([FinancialDocumentId], [FinancialId], [FinancialDocumentTypeId], [IsRequired], [ReasonNotCreated], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 1, 1, 0, N'The cost is considered non-capitalizable', 0),
    (2, 1, 2, 0, N'The cost is considered non-capitalizable', 0),
    (3, 1, 3, 1, NULL, 0),
    (4, 1, 4, 0, NULL, 0),
    (5, 1, 5, 0, NULL, 0),
    (6, 1, 6, 1, NULL, 0),
    (7, 1, 7, 1, NULL, 0),
    (8, 1, 8, 0, NULL, 0),
    (9, 1, 9, 1, NULL, 0)
) AS s ([FinancialDocumentId], [FinancialId], [FinancialDocumentTypeId], [IsRequired], [ReasonNotCreated], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.FinancialDocument t WHERE t.[FinancialDocumentId] = s.[FinancialDocumentId]);

SET IDENTITY_INSERT app.FinancialDocument OFF;
GO
