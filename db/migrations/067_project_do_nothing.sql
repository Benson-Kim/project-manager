-- 067_project_do_nothing.sql — the Business Case gains "Do Nothing", the outcome of leaving the
-- problem as it is, written as prose between Strategic objective alignment and Alternative
-- solutions considered. It is the same kind of column as [AlternativeSolutions] (migration 056).
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Project', N'DoNothing') IS NULL
    ALTER TABLE app.Project ADD [DoNothing] NVARCHAR(MAX) NULL;
GO
