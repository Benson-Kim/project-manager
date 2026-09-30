-- 012_qa_source_id.sql — add SourceQAId idempotency column and make ProjectId nullable
-- in app.QuestionAnswer so seed rows 10 and 11 (null ProjectID in source) can be loaded.
--
-- The seed (006_question_answer.sql) previously omitted QAID 10 and 11 because their
-- ProjectID is NULL, but ProjectId was NOT NULL. This migration:
--   1. Adds SourceQAId INT NULL — a migration-only idempotency marker used by the seed
--      MERGE. No FK, no unique index — it is purely for seed re-run safety.
--   2. Backfills SourceQAId on rows inserted by the old seed (C11-1 fix): the old seed
--      used a composite (ProjectId, Question) key; we match on that to assign the stable
--      source IDs before the MERGE key changes. Without this step a second deployment
--      would insert duplicate rows (the new MERGE key finds SourceQAId = NULL = no match).
--   3. Makes ProjectId nullable and drops the FK so null-project rows can be stored.
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

-- 2. Backfill SourceQAId on rows that were inserted by the previous seed
--    (which used (ProjectId, Question) as the implicit key). This must run before
--    the seed MERGE switches to SourceQAId as its key, otherwise every existing row
--    gets re-inserted as a duplicate on next deployment (C11-1 fix).
UPDATE app.QuestionAnswer
SET SourceQAId = src.SourceQAId
FROM app.QuestionAnswer qa
JOIN (VALUES
    (1,  2,    N'How soon can you complete the Notes section?'),
    (2,  2,    N'I need a little work done, are you available?'),
    (4,  2,    N'Hey'),
    (5,  2,    N'Another Question'),
    (6,  2,    N'Yet another question'),
    (7,  2,    N'Question'),
    (8,  2,    N'Another question'),
    (9,  14,   N'Question'),
    (12, 22,   N'Question'),
    (13, 2,    N'Question')
) AS src (SourceQAId, ProjectId, Question)
    ON src.ProjectId = qa.ProjectId
   AND src.Question  = qa.Question
   AND qa.SourceQAId IS NULL
   AND qa.IsDeleted  = 0;
GO

-- 3. Drop the NOT NULL constraint on ProjectId (requires dropping FK first).
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
