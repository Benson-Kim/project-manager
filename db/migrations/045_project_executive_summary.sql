-- 045_project_executive_summary.sql — the project overview's Objective becomes the Executive
-- Summary, with no length cap (client feedback 2026-10-26; ADR-0047 decision 1).
--   app.Project.Mandate NVARCHAR(255) -> NVARCHAR(MAX): the client writes an executive summary
--     here, and 255 characters is under two sentences. The column keeps its name, so no data
--     moves and nothing downstream is renamed — only the label the user reads changes, in
--     messages.projects.mandate. ProblemStatement, CurrentState, FutureState and UserImpact are
--     already NVARCHAR(MAX), so this makes the narrative fields of one form agree.
--   Widening is a metadata-only change on a NULLable column with no index, no constraint and no
--     computed column over it, so SQL Server rewrites no pages and the apply is instant whatever
--     the row count.
--   Mandate is one of usp_Project_List's four search columns. A LIKE over NVARCHAR(MAX) cannot
--     use an index seek, but neither could the NVARCHAR(255) one behind a leading wildcard, so
--     the plan is the scan it already was (ADR-0016 caps the page, so the scan is bounded).
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Project', N'Mandate') IS NOT NULL
   AND EXISTS (SELECT 1
                 FROM sys.columns
                WHERE object_id = OBJECT_ID(N'app.Project')
                  AND name = N'Mandate'
                  AND max_length <> -1)
    ALTER TABLE app.Project ALTER COLUMN [Mandate] NVARCHAR(MAX) NULL;
GO
