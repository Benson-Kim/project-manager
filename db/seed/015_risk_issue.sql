-- Seed app.RiskIssue — ALL rows from docs/source/analysis/access-database.md §4 (tblRisksIssuesTracker).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.RiskIssue ON;

INSERT INTO app.RiskIssue ([RiskIssueId], [ProjectId], [Description], [Category], [DateIdentified], [Status], [Priority], [Impact], [Probability], [MitigationPlan], [Owner], [DueDate], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'<div>Adding risk/issues raises an error in the code, project id was missing</div>', N'Issue', N'2024-12-31', N'Closed', N'High', N'Low', N'High', N'<div>Rename the relevant field to ProjectID </div>', NULL, N'2024-12-31', 0),
    (2, 2, N'<div>Clicking &quot;New Item&quot; in Finanacials takes user to parking lot items</div>', N'Issue', N'2024-12-31', N'In Progress', N'High', NULL, N'High', N'<div>Change the code to open financials entry instead of opening parking lot items</div>', NULL, N'2024-12-31', 0)
) AS s ([RiskIssueId], [ProjectId], [Description], [Category], [DateIdentified], [Status], [Priority], [Impact], [Probability], [MitigationPlan], [Owner], [DueDate], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.RiskIssue t WHERE t.[RiskIssueId] = s.[RiskIssueId]);

SET IDENTITY_INSERT app.RiskIssue OFF;
GO
