-- 005_projects_refinements.sql — projects module refinements (module projects, issue #5).
-- Adds the remaining checklist add-on columns (requirements row 69) to
-- app.Project: ProjectStatus, ProjectPhase, RiskLevel (NVARCHAR(50) NULL —
-- same shape as ProjectPriority from migration 003; no source data, so no
-- seed backfill). Never edits merged migrations (fix-forward per STANDARDS).
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Project', N'ProjectStatus') IS NULL
    ALTER TABLE app.Project ADD [ProjectStatus] NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'app.Project', N'ProjectPhase') IS NULL
    ALTER TABLE app.Project ADD [ProjectPhase] NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'app.Project', N'RiskLevel') IS NULL
    ALTER TABLE app.Project ADD [RiskLevel] NVARCHAR(50) NULL;
GO

-- List-proc filter/sort support (ADR-0016: index the sort columns).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Project_Status_Priority' AND object_id = OBJECT_ID(N'app.Project'))
    CREATE INDEX IX_Project_Status_Priority ON app.Project (ProjectStatus, ProjectPriority) INCLUDE (ProjectName) WHERE IsDeleted = 0;
GO
