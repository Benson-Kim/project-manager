-- Seed app.ItResourceCategory — ALL rows from docs/source/analysis/access-database.md §4 (tblITResourcePlanning).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.ItResourceCategory ON;

INSERT INTO app.ItResourceCategory ([ItResourceCategoryId], [ProjectId], [Resource], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'IT Security', 0),
    (2, 2, N'User Training', 0),
    (3, 2, N'IT Interfaces', 0),
    (5, 2, N'IT Local Techs', 0),
    (6, 2, N'IT Infrasturcture', 0),
    (7, 2, N'New Resource', 0),
    (8, 1, N'IT Interfaces', 0),
    (10, 3, N'IT Interface', 0),
    (11, 1, N'IT Infrastructure', 0),
    (12, 1, N'User Training', 0),
    (13, 1, N'IT Local Tech', 0),
    (14, 1, N'IT Security', 0),
    (15, 14, N'IT Infrastructure', 0),
    (16, 2, N'Resource Test', 0),
    (17, 2, N'New Resource', 0)
) AS s ([ItResourceCategoryId], [ProjectId], [Resource], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.ItResourceCategory t WHERE t.[ItResourceCategoryId] = s.[ItResourceCategoryId]);

SET IDENTITY_INSERT app.ItResourceCategory OFF;
GO
