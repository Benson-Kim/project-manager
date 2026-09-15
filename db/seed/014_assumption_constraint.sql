-- Seed app.AssumptionConstraint — ALL rows from docs/source/analysis/access-database.md §4 (tblAssumptionsConstraints).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.AssumptionConstraint ON;

INSERT INTO app.AssumptionConstraint ([AssumptionConstraintId], [ProjectId], [Type], [Description], [IsValidated], [Impact], [MitigationPlan], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'Constraint', N'I will make it on time', 1, NULL, NULL, 0),
    (2, 2, N'Assumption', N'Is this constraint validated?', 0, NULL, NULL, 0),
    (3, 2, N'Assumption', N'This ia an assumption', 1, NULL, NULL, 0),
    (4, 2, N'Assumption', N'My first assumption edited', 1, NULL, NULL, 0),
    (5, 2, N'Assumption', N'Assumption', 1, NULL, NULL, 0),
    (6, 2, N'Constraint', N'Constraint', 0, NULL, NULL, 0),
    (7, 2, N'Assumption', N'Assumption and Constraint', 1, N'High', NULL, 0),
    (8, 2, NULL, N'New', 0, NULL, NULL, 0)
) AS s ([AssumptionConstraintId], [ProjectId], [Type], [Description], [IsValidated], [Impact], [MitigationPlan], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.AssumptionConstraint t WHERE t.[AssumptionConstraintId] = s.[AssumptionConstraintId]);

SET IDENTITY_INSERT app.AssumptionConstraint OFF;
GO
