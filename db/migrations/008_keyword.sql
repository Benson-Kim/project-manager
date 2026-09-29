-- 008_keyword.sql — rename app.Keyword.[Acronym] → [Keyword]; rebuild covering index.
-- Migration 003 created the table with the original source column name [Acronym].
-- The entity was renamed to "Keyword" in the data model; the stored procedures and
-- seed already reference [Keyword], so this migration makes the schema consistent.
-- Idempotent: renames and index drop/create are guarded by existence checks.
USE ProjectManager;
GO

-- Rename the column only if it still has the old name.
IF COL_LENGTH(N'app.Keyword', N'Acronym') IS NOT NULL
    EXEC sp_rename N'app.Keyword.Acronym', N'Keyword', N'COLUMN';
GO

-- Rebuild the covering index to reference the renamed column.
-- Drop the old index first (it references [Acronym] in its INCLUDE).
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Keyword_ProjectId'
           AND object_id = OBJECT_ID(N'app.Keyword'))
    DROP INDEX IX_Keyword_ProjectId ON app.Keyword;
GO

-- Recreate with [Keyword] in the INCLUDE clause.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Keyword_ProjectId'
               AND object_id = OBJECT_ID(N'app.Keyword'))
    CREATE INDEX IX_Keyword_ProjectId ON app.Keyword (ProjectId, IsDeleted) INCLUDE ([Keyword]);
GO
