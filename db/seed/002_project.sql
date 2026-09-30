-- Seed app.Project — ALL rows from docs/source/analysis/access-database.md §4 (tblProjectFramework).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
-- ProjectPriority / EstimatedCompletionDate are checklist add-ons (row 69) — no source data, seeded NULL.
USE ProjectManager;
GO
SET IDENTITY_INSERT app.Project ON;

INSERT INTO app.Project ([ProjectId], [ProjectName], [ProjectManager], [BusinessAnalyst], [ProjectDocs], [ProjectSponsor], [DateOfProject], [ProblemStatement], [CurrentState], [FutureState], [UserImpact], [Mandate], [ProjectStatusCom], [ExistBusMod], [A1], [DA], [DAS], [PurchaseOrder], [Requisition], [DO], [FinancingSource], [FinancingCost], [RecurrentCost], [PurchaseEquipment], [EquipmentNotes], [StartDate], [EndDate], [SimilarProject], [ProjectPriority], [EstimatedCompletionDate], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, N'Platform migraation', N'Saeol', NULL, NULL, N'Amareez', N'2024-12-12', N'Manual onboarding leads to delays', N'Manual workflows', N'Automated onboarding platform', N'High', N'Improve efficiency', N'Planning', N'No', 1, 1, 0, 0, 0, 1, NULL, 70.0, 90.0, 1, NULL, N'2024-12-12', N'2024-12-30', 0, NULL, NULL, 0),
    (2, N'Upgrade Inventory Management', N'Saeol', NULL, NULL, N'Borton', N'2024-12-14', N'Inventory discrepancies', N'No reports, some forms missing', N'All reports done, same as all forms done well', N'medium', N'Achieve the best version possible', N'Completed', NULL, 1, 0, 0, 1, 1, 0, N'Unknown', 500.0, 0.0, 0, N'Complete the project with all details discussed done', N'2024-12-13', N'2024-12-28', 0, NULL, NULL, 0),
    (3, N'Generate landing page using Bolt AI', NULL, NULL, NULL, NULL, N'2024-12-15', N'Lack of AI-driven automation', N'No reports, forms missing', N'Accurate and synced inventory', N'Low', N'Reduce errors', N'In Progress', NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, N'2024-12-23', N'2024-12-24', 0, NULL, NULL, 0),
    (4, N'IT Service Desk Overhaul', NULL, NULL, NULL, NULL, N'2024-12-27', N'Long resolution times', N'Manual web creation', N'Ai-Assisted web generation', N'High', N'Adopt new tech trends', N'Not Started', NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (5, N'Mobile App Performance Testing', NULL, NULL, NULL, NULL, N'2024-12-27', N'Poor mobile app performance', N'Outdated ticketing system', N'Modern serl-service desk', N'High', N'Enhance user support', N'Not Started', NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (6, N'New Network Configuration', NULL, NULL, NULL, NULL, N'2024-12-27', N'Network outages causing disruptions', N'Minimal load testing', N'Optimized app perfomance', N'High', N'Increase app adoption', N'Planning', NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (8, N'Vendor Management System Update', N'Lisa White', N'Mike Brown', NULL, N'Jared Smith', N'2024-12-27', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (9, N'Internal Collaboration Tool', N'Project', NULL, NULL, NULL, N'2024-12-27', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (14, N'Data Backup Enhancement', N'Yes, I don’琀', N'Analyst', NULL, N'Sponsor', N'2024-12-26', N'Problem or Opportunity', NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (15, N'System Integration Testing', N'Manager', N'Analyst', NULL, N'Sponsor', N'2024-12-27', N'Problem was "You tried to assign the NULL value to a variable that is not a Variant data type."', N'I think it is solved', N'It will be solved', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (20, N'New Employee Training Module', NULL, NULL, NULL, NULL, N'2024-12-27', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (22, N'Software Quality Assurance', NULL, NULL, NULL, NULL, N'2024-12-27', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (23, N'Marketing Automation Setup', NULL, NULL, NULL, NULL, N'2024-12-27', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (24, N'Data warehouse optimization', N'Anna bell', N'Lisa Chen', NULL, N'David Walker', N'2024-12-30', N'Slow data queries are impacting reporting', N'Fragmented data sources', N'Optimized central data warehouse', NULL, N'Normalize data', NULL, NULL, 1, 1, 1, 1, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (25, N'Migration to Cloud', N'Michael Lee', N'Andrew Skipp', NULL, N'Simon Keep', N'2024-12-30', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (26, N'Marketing Automation Setup', N'David James', NULL, NULL, NULL, N'2024-12-30', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0.0, 0.0, 0, NULL, NULL, NULL, 0, NULL, NULL, 0),
    (27, N'Students NEMIS Update', N'Tifamovs Saeol', N'Frank Kiogora', NULL, N'Martin Nyaga', N'2024-12-30', N'Optimize system to reduce time taken for user aunthentication', N'Takes time to aunthenticate users using biometrics', N'Easier facial or thumb recognition', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, N'CDF', 7000.0, 850.0, 0, NULL, N'2024-12-01', N'2025-01-31', 0, NULL, NULL, 0),
    (28, N'Migraation', N'anne', NULL, NULL, N'will', N'2025-01-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 0, 1, 1, 1, 0, NULL, 90.0, 60.0, 1, NULL, N'2025-01-01', N'2025-01-08', 0, NULL, NULL, 0)
) AS s ([ProjectId], [ProjectName], [ProjectManager], [BusinessAnalyst], [ProjectDocs], [ProjectSponsor], [DateOfProject], [ProblemStatement], [CurrentState], [FutureState], [UserImpact], [Mandate], [ProjectStatusCom], [ExistBusMod], [A1], [DA], [DAS], [PurchaseOrder], [Requisition], [DO], [FinancingSource], [FinancingCost], [RecurrentCost], [PurchaseEquipment], [EquipmentNotes], [StartDate], [EndDate], [SimilarProject], [ProjectPriority], [EstimatedCompletionDate], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.Project t WHERE t.[ProjectId] = s.[ProjectId]);

SET IDENTITY_INSERT app.Project OFF;
GO
