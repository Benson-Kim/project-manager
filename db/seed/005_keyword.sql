-- Seed app.Keyword — ALL rows from docs/source/analysis/access-database.md §4 (tblAcronyms).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.Keyword ON;

INSERT INTO app.Keyword ([KeywordId], [ProjectId], [Acronym], [Definition], [CreatedBy])
SELECT s.*
FROM (VALUES
    (2, 1, N'DB', N'Database', 0),
    (3, 2, N'DB', N'Database', 0),
    (7, 2, N'WS', N'Web Service', 0),
    (8, 2, N'ADS', N'About Doing Something', 0),
    (9, 2, N'Cr', N'Credit', 0),
    (10, 2, N'Db', N'Debit', 0),
    (12, 2, N'ABS', N'Anti Locking System', 0),
    (13, 2, N'New', N'NEWWWW', 0),
    (14, 2, N'acn', N'Acronym', 0),
    (16, 2, N'CAN', N'Calcium ammonium Nitrate', 0),
    (17, 2, N'Can', N'calcium ammonium nitrate', 0),
    (18, 2, N'AC', N'Acronym', 0),
    (19, NULL, N'AC', N'Acronym', 0),
    (20, 6, N'new', N'Acronym', 0),
    (21, NULL, N'AC', N'Acronym', 0),
    (22, 8, N'AC', N'Acronym', 0),
    (23, NULL, N'hey', N'new', 0),
    (24, 9, N'AC', N'Acronym', 0),
    (25, 14, N'AC', N'Acronym', 0),
    (26, 14, N'It worked', NULL, 0),
    (27, 15, N'AC', N'Acronym', 0),
    (28, 20, N'Me', N'Too', 0),
    (29, 1, N'AC', N'Acronym', 0),
    (30, 2, N'NEWC', N'New Acronym', 0),
    (31, 26, N'AC', N'Acronym', 0),
    (32, 26, N'AD', N'Advertisement', 0),
    (33, 26, N'US', N'United States', 0),
    (34, 26, N'CA', N'Canada', 0),
    (35, 26, N'KE', N'Kenya', 0)
) AS s ([KeywordId], [ProjectId], [Acronym], [Definition], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.Keyword t WHERE t.[KeywordId] = s.[KeywordId]);

SET IDENTITY_INSERT app.Keyword OFF;
GO
