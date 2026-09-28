-- 012_qa_source_id.sql — add SourceQAId idempotency column and make ProjectId nullable
-- in app.QuestionAnswer so seed rows 10 and 11 (null ProjectID in source) can be loaded.
--
-- The seed (006_question_answer.sql) previously omitted QAID 10 and 11 because their
-- ProjectID is NULL, but ProjectId was NOT NULL. This migration:
--   1. Adds SourceQAId INT NULL — a migration-only idempotency marker used by the seed
--      MERGE. No FK, no unique index — it is purely for seed re-run safety.
--   2. Makes ProjectId nullable and drops the FK so null-project rows can be stored.
--      The FK is re-added as a nullable FK (REFERENCES allow NULL by default in SQL Server).
--
-- Application code still validates ProjectId as required at the action layer (zod schema).
-- Only the seed inserts rows with NULL ProjectId to faithfully preserve source data.
--
-- Idempotent: each ALTER is guarded by a column/constraint existence check.
USE ProjectManager;
GO

-- 1. Add SourceQAId column if absent.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'app.QuestionAnswer')
      AND name = N'SourceQAId'
)
    ALTER TABLE app.QuestionAnswer ADD SourceQAId INT NULL;
GO

-- 2. Drop the NOT NULL constraint on ProjectId (requires dropping FK first).
--    Only needed when the column is still NOT NULL.
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_QuestionAnswer_Project'
      AND parent_object_id = OBJECT_ID(N'app.QuestionAnswer')
)
    ALTER TABLE app.QuestionAnswer DROP CONSTRAINT FK_QuestionAnswer_Project;
GO

-- Alter ProjectId to nullable (safe even if already nullable).
ALTER TABLE app.QuestionAnswer ALTER COLUMN ProjectId INT NULL;
GO

-- Re-add FK as nullable (SQL Server FKs allow NULL values by default).
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_QuestionAnswer_Project'
      AND parent_object_id = OBJECT_ID(N'app.QuestionAnswer')
)
    ALTER TABLE app.QuestionAnswer ADD CONSTRAINT FK_QuestionAnswer_Project
        FOREIGN KEY (ProjectId) REFERENCES app.Project(ProjectId);
GO
