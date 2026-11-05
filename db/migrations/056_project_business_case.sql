-- 056_project_business_case.sql — the project overview gains the Business Case, and the project
-- plan its scope and dependencies (client updates 2026-11-03, items B and C). The client's framing
-- is that these fields are what a report is generated from, so each one is stored as itself rather
-- than folded into an existing narrative column.
--   app.Project gains [AlternativeSolutions], [ExpectedBenefits], [SuccessMetrics], [ProjectScope]
--     and [KeyDependencies] as NVARCHAR(MAX) NULL — the same kind of column as [ProblemStatement],
--     [CurrentState], [FutureState] and [Mandate], which migration 045 widened for the same reason:
--     the client writes prose here, and a cap of 255 is under two sentences.
--   [EstimatedRoi] is NVARCHAR(255), not DECIMAL. The client asked for "Text or Number" and writes
--     prose in practice ("18 months", "1.4x by FY27"); it feeds a report rather than any
--     arithmetic, and a DECIMAL would force a unit they have never named.
--   Strategic Objective Alignment takes several values, so it is a link table, not a delimited
--     column: app.ProjectObjectiveAlignment holds one row per label, which can be filtered and
--     counted, and which dbo.usp_LookupList_Set can rename when BL20 lets the client edit the list.
--     Nothing in this app stores a set in a string.
--   The list 'project.objective-alignment' is seeded with generic pillars because the client named
--     no options. They are starter values an Admin renames or replaces from the list editor
--     (ADR-0022), not a closed set, so none of them is locked: no code reads them by name.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Project', N'AlternativeSolutions') IS NULL
    ALTER TABLE app.Project ADD [AlternativeSolutions] NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.Project', N'ExpectedBenefits') IS NULL
    ALTER TABLE app.Project ADD [ExpectedBenefits] NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.Project', N'SuccessMetrics') IS NULL
    ALTER TABLE app.Project ADD [SuccessMetrics] NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.Project', N'EstimatedRoi') IS NULL
    ALTER TABLE app.Project ADD [EstimatedRoi] NVARCHAR(255) NULL;
GO

IF COL_LENGTH(N'app.Project', N'ProjectScope') IS NULL
    ALTER TABLE app.Project ADD [ProjectScope] NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.Project', N'KeyDependencies') IS NULL
    ALTER TABLE app.Project ADD [KeyDependencies] NVARCHAR(MAX) NULL;
GO

-- One row per objective a project is aligned to. Label is NVARCHAR(50), the width every
-- label-bound column has (LOOKUP_LABEL_MAX), so the rename cascade and the option cap agree.
-- The primary key is the invariant "a project lists an objective once" — enforced where it cannot
-- be bypassed, rather than by the proc that happens to write it.
IF OBJECT_ID(N'app.ProjectObjectiveAlignment', N'U') IS NULL
BEGIN
    CREATE TABLE app.ProjectObjectiveAlignment (
        ProjectId    INT NOT NULL
            CONSTRAINT FK_ProjectObjectiveAlignment_Project REFERENCES app.Project (ProjectId),
        Label        NVARCHAR(50) NOT NULL,
        CreatedAtUtc DATETIME2 NOT NULL
            CONSTRAINT DF_ProjectObjectiveAlignment_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        CONSTRAINT PK_ProjectObjectiveAlignment PRIMARY KEY (ProjectId, Label)
    );
END;
GO

-- Renaming an option visits this table by label (dbo.usp_LookupList_Set), and the overview reads a
-- project's labels in display order.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ProjectObjectiveAlignment_Label'
                 AND object_id = OBJECT_ID(N'app.ProjectObjectiveAlignment'))
    CREATE INDEX IX_ProjectObjectiveAlignment_Label
        ON app.ProjectObjectiveAlignment (Label) INCLUDE (ProjectId);
GO

MERGE app.LookupList AS t
USING (SELECT N'project.objective-alignment' AS ListKey) AS s
ON t.ListKey = s.ListKey
WHEN NOT MATCHED THEN INSERT (ListKey) VALUES (s.ListKey);
GO

DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'project.objective-alignment', N'Growth',                  1, 0),
    (N'project.objective-alignment', N'Customer Experience',     2, 0),
    (N'project.objective-alignment', N'Operational Efficiency',  3, 0),
    (N'project.objective-alignment', N'Cost Reduction',          4, 0),
    (N'project.objective-alignment', N'Compliance',              5, 0),
    (N'project.objective-alignment', N'Innovation',              6, 0),
    (N'project.objective-alignment', N'Sustainability',          7, 0);

-- Matching on the label never resurrects an option an Admin removed.
MERGE app.LookupOption AS t
USING @Seed AS s
ON t.ListKey = s.ListKey AND t.Label = s.Label
WHEN NOT MATCHED THEN INSERT (ListKey, Label, SortOrder, IsLocked, CreatedBy)
                      VALUES (s.ListKey, s.Label, s.SortOrder, s.IsLocked, 0);
GO
