-- Seed app.Financial — ALL rows from docs/source/analysis/access-database.md §4 (tblFinancials).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.Financial ON;

INSERT INTO app.Financial ([FinancialId], [ProjectId], [ProjectNumber], [Acquisition], [GlGrandLivre], [BudgetEnvelope], [Budget], [SpendBy], [RecurrentFees], [ContractTimeframe], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, 1018732, N'Qualite Prix', N'A1-12345', N'PMT EIRI', 100000.0, N'Payment for the full year', 900000.0, N'3 years - 2 options', 0),
    (2, 2, 0, N'Acquisation', N'GL Grand', N'Budget Envelope', 10000.0, N'3 months min', 3000.0, N'3 years', 0)
) AS s ([FinancialId], [ProjectId], [ProjectNumber], [Acquisition], [GlGrandLivre], [BudgetEnvelope], [Budget], [SpendBy], [RecurrentFees], [ContractTimeframe], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.Financial t WHERE t.[FinancialId] = s.[FinancialId]);

SET IDENTITY_INSERT app.Financial OFF;
GO
