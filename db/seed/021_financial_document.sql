-- Seed app.FinancialDocument — ALL rows from docs/source/analysis/access-database.md §4 (tblProjectFinancialDocuments).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
-- Name / SortOrder (migration 033, ADR-0030): the display name of the legacy type and its order.
USE ProjectManager;
GO
SET IDENTITY_INSERT app.FinancialDocument ON;

INSERT INTO app.FinancialDocument ([FinancialDocumentId], [FinancialId], [FinancialDocumentTypeId], [IsRequired], [ReasonNotCreated], [CreatedBy], [Name], [SortOrder])
SELECT s.*
FROM (VALUES
    (1, 1, 1, 0, N'The cost is considered non-capitalizable', 0, N'DA (Dossier d''affaires)', 1),
    (2, 1, 2, 0, N'The cost is considered non-capitalizable', 0, N'DAS (Dossier d''affaires simplifié)', 2),
    (3, 1, 3, 1, NULL, 0, N'Demande de signature', 3),
    (4, 1, 4, 0, NULL, 0, N'DO (Dossier d''opportunité)', 4),
    (5, 1, 5, 0, NULL, 0, N'Appel d''offres / Call for tender', 5),
    (6, 1, 6, 1, NULL, 0, N'Montage financier', 6),
    (7, 1, 7, 1, NULL, 0, N'Réquisition', 7),
    (8, 1, 8, 0, NULL, 0, N'A1', 8),
    (9, 1, 9, 1, NULL, 0, N'Signed direct contract', 9)
) AS s ([FinancialDocumentId], [FinancialId], [FinancialDocumentTypeId], [IsRequired], [ReasonNotCreated], [CreatedBy], [Name], [SortOrder])
WHERE NOT EXISTS (SELECT 1 FROM app.FinancialDocument t WHERE t.[FinancialDocumentId] = s.[FinancialDocumentId]);

SET IDENTITY_INSERT app.FinancialDocument OFF;
GO
