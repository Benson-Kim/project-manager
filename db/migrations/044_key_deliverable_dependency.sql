-- 044_key_deliverable_dependency.sql — dependencies between work breakdown items (client feedback
-- 2026-10-23; ADR-0046 decisions 5-10).
--   app.KeyDeliverableDependency records one link per ordered pair of items, typed FS/SS/FF/SF with
--     a lag in days. The type is a property of the link, so two items are never joined twice to
--     carry two types.
--   ProjectId is carried on the link, as app.RequirementDeliverable carries it (036), so the Gantt's
--     freshness stamp and the project scoping are both one-table reads.
--   Both ends are held inside the link's project by composite foreign keys. They reference
--     UX_KeyDeliverable_Id_Project, the unique index migration 036 added for exactly this purpose,
--     so this is a strong invariant and not a proc-level check. app.KeyDeliverable.ProjectId is
--     nullable while the link's is NOT NULL, so an item belonging to no project can hold no link —
--     the behaviour we want, since a link is scheduled within one project's window.
--   What no constraint can express, because each spans rows, is checked by the write procs under
--     the app.Project (UPDLOCK, HOLDLOCK) that ADR-0027 decision 4 already requires of every
--     structural write: no cycle, and no link between an item and its own ancestor or descendant
--     (a summary already contains its branch, so sequencing it against its own child says nothing).
--   A link is soft-deleted, with its item's branch, by usp_KeyDeliverable_Delete.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.KeyDeliverableDependency', N'U') IS NULL
BEGIN
    CREATE TABLE app.KeyDeliverableDependency (
        DependencyId   INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_KeyDeliverableDependency PRIMARY KEY,
        ProjectId      INT NOT NULL
            CONSTRAINT FK_KeyDeliverableDependency_Project REFERENCES app.Project (ProjectId),
        PredecessorId  INT NOT NULL,
        SuccessorId    INT NOT NULL,
        DependencyType CHAR(2) NOT NULL
            CONSTRAINT CK_KeyDeliverableDependency_Type
                CHECK (DependencyType IN ('FS', 'SS', 'FF', 'SF')),
        LagDays        INT NOT NULL
            CONSTRAINT DF_KeyDeliverableDependency_LagDays DEFAULT (0),
        IsDeleted      BIT NOT NULL
            CONSTRAINT DF_KeyDeliverableDependency_IsDeleted DEFAULT (0),
        DeletedAtUtc   DATETIME2 NULL,
        DeletedBy      INT NULL,
        CreatedAtUtc   DATETIME2 NOT NULL
            CONSTRAINT DF_KeyDeliverableDependency_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy      INT NOT NULL,
        UpdatedAtUtc   DATETIME2 NULL,
        UpdatedBy      INT NULL,
        RowVer         ROWVERSION,
        CONSTRAINT CK_KeyDeliverableDependency_NotSelf
            CHECK (PredecessorId <> SuccessorId),
        CONSTRAINT CK_KeyDeliverableDependency_Lag
            CHECK (LagDays BETWEEN -3650 AND 3650),
        CONSTRAINT FK_KeyDeliverableDependency_Predecessor
            FOREIGN KEY (PredecessorId, ProjectId)
            REFERENCES app.KeyDeliverable (KeyDeliverableId, ProjectId),
        CONSTRAINT FK_KeyDeliverableDependency_Successor
            FOREIGN KEY (SuccessorId, ProjectId)
            REFERENCES app.KeyDeliverable (KeyDeliverableId, ProjectId)
    );

    -- One live link per ordered pair. Filtered, so re-linking a pair after an unlink is allowed.
    CREATE UNIQUE INDEX UX_KeyDeliverableDependency_Pair
        ON app.KeyDeliverableDependency (PredecessorId, SuccessorId)
        WHERE IsDeleted = 0;

    -- Both directions of the Dependencies panel, and the cascade's walk down the chain.
    CREATE INDEX IX_KeyDeliverableDependency_Successor
        ON app.KeyDeliverableDependency (SuccessorId)
        INCLUDE (PredecessorId, DependencyType, LagDays);
    CREATE INDEX IX_KeyDeliverableDependency_Predecessor
        ON app.KeyDeliverableDependency (PredecessorId)
        INCLUDE (SuccessorId, DependencyType, LagDays);

    -- The Gantt's freshness stamp reads MAX(RowVer) for the project.
    CREATE INDEX IX_KeyDeliverableDependency_Project
        ON app.KeyDeliverableDependency (ProjectId) INCLUDE (RowVer);
END;
GO
