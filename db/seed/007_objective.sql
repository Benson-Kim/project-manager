-- Seed app.Objective — ALL rows from docs/source/analysis/access-database.md §4 (tblProjectObjectives).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.Objective ON;

INSERT INTO app.Objective ([ObjectiveId], [ProjectId], [QMeasurable], [QSuccess], [QAlignmentStrategy], [ObjectiveText], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'Yes', N'Yes', N'Yes', N'13.2-The systems "To do list" is made up of Daily task line items that can be arranged in any order.', 0),
    (2, 2, N'Yes', N'Yes', N'Yes', N'This is my second project objective', 0),
    (3, 2, N'Yes', N'Yes', N'Yes', N'This is a third objective that I have edited', 0),
    (4, 14, NULL, NULL, NULL, N'Objective', 0),
    (5, 2, N'Yes', N'Yes', N'Yes', N'New Objective', 0),
    (6, 1, NULL, NULL, NULL, NULL, 0)
) AS s ([ObjectiveId], [ProjectId], [QMeasurable], [QSuccess], [QAlignmentStrategy], [ObjectiveText], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.Objective t WHERE t.[ObjectiveId] = s.[ObjectiveId]);

SET IDENTITY_INSERT app.Objective OFF;
GO
