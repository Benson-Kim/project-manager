-- 035_key_deliverable_requirement.sql — a deliverable's requirements (client feedback 2026-10-20,
-- ADR-0036): each item of the work breakdown has none or many requirements, listed under it in the
-- WBS diagram and the Gantt's outline, as the minutes list discussion points under an agenda item.
--   KeyDeliverableId: the item the requirement belongs to; it never changes after creation.
--   Requirement: the wording, required (the procs refuse a blank one).
--   IsMet: ticked off once the requirement is satisfied.
--   SortOrder: position among the item's requirements, from 1.
-- Soft delete, audit columns and RowVer as on every entity (ADR-0011). Deleting an item deletes its
-- requirements with it (usp_KeyDeliverable_Delete).
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.KeyDeliverableRequirement', N'U') IS NULL
BEGIN
    CREATE TABLE app.KeyDeliverableRequirement (
        KeyDeliverableRequirementId INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_KeyDeliverableRequirement PRIMARY KEY,
        KeyDeliverableId INT NOT NULL
            CONSTRAINT FK_KeyDeliverableRequirement_KeyDeliverable
                REFERENCES app.KeyDeliverable (KeyDeliverableId),
        Requirement   NVARCHAR(4000) NOT NULL,
        IsMet         BIT NOT NULL CONSTRAINT DF_KeyDeliverableRequirement_IsMet DEFAULT 0,
        SortOrder     INT NOT NULL CONSTRAINT DF_KeyDeliverableRequirement_SortOrder DEFAULT 0,
        IsDeleted     BIT NOT NULL CONSTRAINT DF_KeyDeliverableRequirement_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL
            CONSTRAINT DF_KeyDeliverableRequirement_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_KeyDeliverableRequirement_Item'
                 AND object_id = OBJECT_ID(N'app.KeyDeliverableRequirement'))
    CREATE INDEX IX_KeyDeliverableRequirement_Item
        ON app.KeyDeliverableRequirement (KeyDeliverableId, IsDeleted, SortOrder)
        INCLUDE (Requirement, IsMet);
GO
