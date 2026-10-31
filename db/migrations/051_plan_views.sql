-- 051_plan_views.sql — the data behind the Gantt, Work breakdown and Kanban views (ADR-0052).
--   app.Requirement
--     MoSCoW CHAR(1) NULL: Must / Should / Could / Won't. NULL is "not prioritised yet".
--     AcceptanceCriteria NVARCHAR(MAX) NULL: the test that says the requirement is met.
--     EstimateDays DECIMAL(6,1) NULL, >= 0: effort in days; parents and deliverables sum it.
--     OwnerStakeholderId INT NULL -> app.Stakeholder: who answers for it. Deliverable assignees are
--       stakeholders too (migration 015). FK_Requirement_OwnerStakeholder is composite,
--       (OwnerStakeholderId, ProjectId) -> UQ_Stakeholder_Project (StakeholderId, ProjectId), so
--       the owner can only be a stakeholder of the requirement's own project, as 048 does for the
--       parent. A NULL owner is not checked (MATCH SIMPLE). A soft-deleted stakeholder is refused
--       by the proc that sets the owner.
--   app.KeyDeliverable
--     Budget DECIMAL(19,2) NULL, >= 0: the planned amount; parents and the project sum it.
--     Note NVARCHAR(MAX) NULL: the note pinned to the item's box (the paperclip).
--   app.Project
--     PlanNote NVARCHAR(MAX) NULL: the sticky note beside the work breakdown chart.
--   app.BoardCard
--     KeyDeliverableId INT NULL -> app.KeyDeliverable: a card can now carry a deliverable as well
--       as a requirement or a plain title. CK_BoardCard_Content is widened so any one of the three
--       is enough. UQ_BoardCard_Deliverable keeps one live card per deliverable per board, as
--       UQ_BoardCard_Requirement does for requirements. The deliverable's project must match the
--       board's project; the card procs check it under the board lock.
--   Progress is not stored: it is derived from the met ticks and the status where it is read.
-- Every new column is nullable with no default, so existing rows keep their meaning and the
-- constraints cannot fail on apply. Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Requirement', N'MoSCoW') IS NULL
    ALTER TABLE app.Requirement ADD [MoSCoW] CHAR(1) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Requirement_MoSCoW'
                 AND parent_object_id = OBJECT_ID(N'app.Requirement'))
    ALTER TABLE app.Requirement ADD CONSTRAINT CK_Requirement_MoSCoW
        CHECK ([MoSCoW] IS NULL OR [MoSCoW] IN ('M', 'S', 'C', 'W'));
GO

IF COL_LENGTH(N'app.Requirement', N'AcceptanceCriteria') IS NULL
    ALTER TABLE app.Requirement ADD AcceptanceCriteria NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.Requirement', N'EstimateDays') IS NULL
    ALTER TABLE app.Requirement ADD EstimateDays DECIMAL(6, 1) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Requirement_EstimateDays'
                 AND parent_object_id = OBJECT_ID(N'app.Requirement'))
    ALTER TABLE app.Requirement ADD CONSTRAINT CK_Requirement_EstimateDays
        CHECK (EstimateDays IS NULL OR EstimateDays >= 0);
GO

IF COL_LENGTH(N'app.Requirement', N'OwnerStakeholderId') IS NULL
    ALTER TABLE app.Requirement ADD OwnerStakeholderId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_Stakeholder_Project'
                 AND object_id = OBJECT_ID(N'app.Stakeholder'))
    CREATE UNIQUE INDEX UQ_Stakeholder_Project ON app.Stakeholder (StakeholderId, ProjectId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Requirement_OwnerStakeholder')
    ALTER TABLE app.Requirement ADD CONSTRAINT FK_Requirement_OwnerStakeholder
        FOREIGN KEY (OwnerStakeholderId, ProjectId)
        REFERENCES app.Stakeholder (StakeholderId, ProjectId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Requirement_OwnerStakeholder'
                 AND object_id = OBJECT_ID(N'app.Requirement'))
    CREATE INDEX IX_Requirement_OwnerStakeholder ON app.Requirement (OwnerStakeholderId)
        WHERE OwnerStakeholderId IS NOT NULL;
GO

IF COL_LENGTH(N'app.KeyDeliverable', N'Budget') IS NULL
    ALTER TABLE app.KeyDeliverable ADD Budget DECIMAL(19, 2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_KeyDeliverable_Budget'
                 AND parent_object_id = OBJECT_ID(N'app.KeyDeliverable'))
    ALTER TABLE app.KeyDeliverable ADD CONSTRAINT CK_KeyDeliverable_Budget
        CHECK (Budget IS NULL OR Budget >= 0);
GO

IF COL_LENGTH(N'app.KeyDeliverable', N'Note') IS NULL
    ALTER TABLE app.KeyDeliverable ADD Note NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.Project', N'PlanNote') IS NULL
    ALTER TABLE app.Project ADD PlanNote NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH(N'app.BoardCard', N'KeyDeliverableId') IS NULL
    ALTER TABLE app.BoardCard ADD KeyDeliverableId INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_BoardCard_KeyDeliverable')
    ALTER TABLE app.BoardCard ADD CONSTRAINT FK_BoardCard_KeyDeliverable
        FOREIGN KEY (KeyDeliverableId) REFERENCES app.KeyDeliverable (KeyDeliverableId);
GO

-- Widen the content rule: drop the two-way version only, so a re-run leaves the new one alone.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_BoardCard_Content'
             AND parent_object_id = OBJECT_ID(N'app.BoardCard')
             AND definition NOT LIKE N'%KeyDeliverableId%')
    ALTER TABLE app.BoardCard DROP CONSTRAINT CK_BoardCard_Content;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_BoardCard_Content'
                 AND parent_object_id = OBJECT_ID(N'app.BoardCard'))
    ALTER TABLE app.BoardCard ADD CONSTRAINT CK_BoardCard_Content
        CHECK (Title IS NOT NULL OR RequirementId IS NOT NULL OR KeyDeliverableId IS NOT NULL);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_BoardCard_Deliverable'
                 AND object_id = OBJECT_ID(N'app.BoardCard'))
    CREATE UNIQUE INDEX UQ_BoardCard_Deliverable ON app.BoardCard (BoardId, KeyDeliverableId)
        WHERE KeyDeliverableId IS NOT NULL AND IsDeleted = 0;
GO
