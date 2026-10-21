-- 035_key_deliverable_requirement.sql — requirements of a work breakdown item (ADR-0036).
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
