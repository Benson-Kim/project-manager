-- 032_key_deliverable_wbs.sql — key deliverables become the project's work breakdown structure,
-- which draws the Gantt (checklist row 67, client notes 2026-10-13; ADR-0027).
--   ParentKeyDeliverableId: the item this one sits under; NULL = top level. The procs keep it in
--     the same project, at most 10 levels deep and free of cycles.
--   SortOrder: position among its siblings, from 1.
--   StartDate: date only, like Deadline (the end). Required by the procs for every new item; a
--     parent's StartDate and Deadline are rolled up from its sub-items by the procs.
--   Color: the bar colour, a palette key as in app.LookupOption.Color (migration 020);
--     NULL takes the parent's colour.
--   Backfill: seed 031, which runs after this migration both on an upgrade and on a new database
--     (after the deliverable seeds), so one script covers every row.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.KeyDeliverable', N'ParentKeyDeliverableId') IS NULL
    ALTER TABLE app.KeyDeliverable ADD ParentKeyDeliverableId INT NULL
        CONSTRAINT FK_KeyDeliverable_Parent REFERENCES app.KeyDeliverable (KeyDeliverableId);
GO

IF COL_LENGTH(N'app.KeyDeliverable', N'SortOrder') IS NULL
    ALTER TABLE app.KeyDeliverable ADD SortOrder INT NOT NULL
        CONSTRAINT DF_KeyDeliverable_SortOrder DEFAULT 0;
GO

IF COL_LENGTH(N'app.KeyDeliverable', N'StartDate') IS NULL
    ALTER TABLE app.KeyDeliverable ADD StartDate DATETIME2 NULL;
GO

IF COL_LENGTH(N'app.KeyDeliverable', N'Color') IS NULL
    ALTER TABLE app.KeyDeliverable ADD Color VARCHAR(10) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_KeyDeliverable_Color')
    ALTER TABLE app.KeyDeliverable ADD CONSTRAINT CK_KeyDeliverable_Color
        CHECK (Color IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_KeyDeliverable_NotOwnParent')
    ALTER TABLE app.KeyDeliverable ADD CONSTRAINT CK_KeyDeliverable_NotOwnParent
        CHECK (ParentKeyDeliverableId <> KeyDeliverableId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_KeyDeliverable_Wbs'
                 AND object_id = OBJECT_ID(N'app.KeyDeliverable'))
    CREATE INDEX IX_KeyDeliverable_Wbs
        ON app.KeyDeliverable (ParentKeyDeliverableId, IsDeleted, SortOrder)
        INCLUDE (ProjectId, StartDate, Deadline);
GO
