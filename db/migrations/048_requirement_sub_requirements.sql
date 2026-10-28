-- 048_requirement_sub_requirements.sql — a requirement can sit under another one (client feedback
-- 2026-10-26, the Requirements page of the 1.0.12 sheet; ADR-0048).
--   "The requirements BR, SR, FR, NF, TR all should be able to create subrequirement
--    E.g. subBR1.1, subBR1.2 then subBR1.1.1 (as many subs as necessary)."
--
--   app.Requirement.ParentRequirementId INT NULL, self-referencing. NULL is a root requirement,
--     which is every row that exists today: **no number and no reference in the register changes
--     when this is applied**, because the numbering and the path below both treat a NULL parent as
--     the scope the flat register already used. That is what makes this safe on a live register.
--
--   FK_Requirement_Parent is composite, (ParentRequirementId, ProjectId) -> UQ_Requirement_Project
--     (RequirementId, ProjectId) from 036, so a child can only ever point at a parent in its own
--     project. A composite FK with a NULL column is not checked at all (MATCH SIMPLE), so a root
--     row passes it untouched. One FK and no cascade: the delete proc refuses a parent that still
--     has children, and two cascading FKs to one table is error 1785 anyway.
--
--   CK_Requirement_NotSelfParent is table-level, because a column CHECK may not name a second
--     column (error 8141, as CK_Requirement_Met above it). `ParentRequirementId <> RequirementId`
--     is UNKNOWN for a root row, which a CHECK accepts, so it constrains only children.
--
--   UX_Requirement_Number gains ParentRequirementId as a *key* column: a number is now unique per
--     parent, not per type, so FR-1.1 and FR-2.1 can both exist. SQL Server treats NULLs as equal
--     in a unique index, so root rows keep their (ProjectId, Type, NULL, Number) uniqueness for
--     free — the one place that behaviour helps rather than hurts.
--     036's comment warns the index is also the Gantt freshness stamp's. It still is:
--     usp_KeyDeliverable_GanttData reads MAX(RowVer) WHERE ProjectId = @ProjectId, ProjectId is
--     still the leading key column and RowVer is still in the INCLUDE list, so that seek is
--     unchanged and no separate stamp index is needed.
--
--   What this migration deliberately does NOT add:
--     * No Depth or Path column. The path is derived by a recursive CTE in the read procs, so it
--       cannot go stale behind a rename or a renumber. The register is paged (ADR-0016, 100 rows),
--       so a child can land on a different page from its parent and the browser could not assemble
--       the path itself.
--     * No depth CHECK. Depth spans rows, so it is taken under the project lock in
--       usp_Requirement_Create, like usp_KeyDeliverable_AssertPlacement. Four levels
--       (FR-1.1.1.1); the client wrote "normally this does not going for long".
--     * No cycle trigger. Parentage is set once, at create, and no proc changes it — a new row
--       cannot be an ancestor of anything, so the only way to build a cycle is a re-parent, and
--       there is none. CK_Requirement_NotSelfParent is the backstop for direct SQL.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Requirement', N'ParentRequirementId') IS NULL
    ALTER TABLE app.Requirement ADD [ParentRequirementId] INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Requirement_Parent'
                 AND parent_object_id = OBJECT_ID(N'app.Requirement'))
    ALTER TABLE app.Requirement ADD CONSTRAINT FK_Requirement_Parent
        FOREIGN KEY (ParentRequirementId, ProjectId)
        REFERENCES app.Requirement (RequirementId, ProjectId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Requirement_NotSelfParent'
                 AND parent_object_id = OBJECT_ID(N'app.Requirement'))
    ALTER TABLE app.Requirement ADD CONSTRAINT CK_Requirement_NotSelfParent
        CHECK (ParentRequirementId <> RequirementId);
GO

-- Re-key the uniqueness from per-type to per-parent. Dropped only while it is still the old
-- three-column index, so a re-run after the new one exists is a no-op.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Requirement_Number'
             AND object_id = OBJECT_ID(N'app.Requirement'))
   AND NOT EXISTS (SELECT 1
                   FROM sys.index_columns AS ic
                   JOIN sys.indexes AS i
                       ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                   JOIN sys.columns AS c
                       ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                   WHERE i.name = N'UX_Requirement_Number'
                     AND i.object_id = OBJECT_ID(N'app.Requirement')
                     AND c.name = N'ParentRequirementId'
                     AND ic.is_included_column = 0)
    DROP INDEX UX_Requirement_Number ON app.Requirement;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Requirement_Number'
                 AND object_id = OBJECT_ID(N'app.Requirement'))
    CREATE UNIQUE INDEX UX_Requirement_Number
        ON app.Requirement (ProjectId, RequirementType, ParentRequirementId, Number)
        INCLUDE (IsDeleted, IsMet, RowVer);
GO

-- The children of one parent, for the delete and type-change refusals and the depth walk. The
-- unique index above cannot serve these: its leading column is ProjectId, not the parent.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Requirement_Parent'
                 AND object_id = OBJECT_ID(N'app.Requirement'))
    CREATE INDEX IX_Requirement_Parent
        ON app.Requirement (ParentRequirementId)
        INCLUDE (IsDeleted)
        WHERE ParentRequirementId IS NOT NULL;
GO
