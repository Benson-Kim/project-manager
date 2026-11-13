-- 073_checklists.sql — dynamic checklists: several named checklists per project, each with a title
-- and a done tick per row, plus columns people add themselves (ADR-0066).
-- app.Checklist: one named checklist; names unique per project among rows not deleted.
-- app.ChecklistColumn: a column someone added. Kind decides what its cells hold: a date, text, a
--   web link, or an action button (ActionKind: sign off, or make a to-do from the row). The kind
--   never changes once the column exists, so its values are never reinterpreted.
-- app.ChecklistItem: one row. A cell write bumps the row's RowVer, so two people on one row get a
--   409 instead of overwriting each other.
-- app.ChecklistCell: one value per row and column, in the typed slot its column's kind uses; an
--   empty cell has no row. Composite keys hold the row, the column and the checklist together, and
--   the checklist holds the project, so no value can cross a checklist or a project.
-- Additive and idempotent, so an older build ignores the tables and a re-run changes nothing.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.Checklist', N'U') IS NULL
    CREATE TABLE app.Checklist (
        ChecklistId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Checklist PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_Checklist_Project REFERENCES app.Project (ProjectId),
        Name         NVARCHAR(120) NOT NULL CONSTRAINT CK_Checklist_Name CHECK (LEN(Name) > 0),
        IsDeleted    BIT NOT NULL CONSTRAINT DF_Checklist_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_Checklist_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_Checklist_Project UNIQUE (ChecklistId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Checklist_Name'
                 AND object_id = OBJECT_ID(N'app.Checklist'))
    CREATE UNIQUE INDEX UX_Checklist_Name ON app.Checklist (ProjectId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.ChecklistColumn', N'U') IS NULL
    CREATE TABLE app.ChecklistColumn (
        ChecklistColumnId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ChecklistColumn PRIMARY KEY,
        ChecklistId  INT NOT NULL,
        ProjectId    INT NOT NULL,
        Name         NVARCHAR(80) NOT NULL CONSTRAINT CK_ChecklistColumn_Name CHECK (LEN(Name) > 0),
        Kind         VARCHAR(20) NOT NULL
            CONSTRAINT CK_ChecklistColumn_Kind CHECK (Kind IN ('date', 'text', 'document', 'action')),
        ActionKind   VARCHAR(20) NULL,
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_ChecklistColumn_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_ChecklistColumn_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT FK_ChecklistColumn_Checklist FOREIGN KEY (ChecklistId, ProjectId)
            REFERENCES app.Checklist (ChecklistId, ProjectId),
        CONSTRAINT UQ_ChecklistColumn_Checklist UNIQUE (ChecklistColumnId, ChecklistId),
        CONSTRAINT CK_ChecklistColumn_ActionKind CHECK (
            (Kind = 'action' AND ActionKind IN ('signoff', 'todo'))
            OR (Kind <> 'action' AND ActionKind IS NULL))
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ChecklistColumn_Name'
                 AND object_id = OBJECT_ID(N'app.ChecklistColumn'))
    CREATE UNIQUE INDEX UX_ChecklistColumn_Name
        ON app.ChecklistColumn (ChecklistId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.ChecklistItem', N'U') IS NULL
    CREATE TABLE app.ChecklistItem (
        ChecklistItemId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ChecklistItem PRIMARY KEY,
        ChecklistId  INT NOT NULL,
        ProjectId    INT NOT NULL,
        Title        NVARCHAR(400) NOT NULL CONSTRAINT CK_ChecklistItem_Title CHECK (LEN(Title) > 0),
        IsDone       BIT NOT NULL CONSTRAINT DF_ChecklistItem_IsDone DEFAULT 0,
        DoneAtUtc    DATETIME2 NULL,
        DoneBy       INT NULL,
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_ChecklistItem_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_ChecklistItem_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT FK_ChecklistItem_Checklist FOREIGN KEY (ChecklistId, ProjectId)
            REFERENCES app.Checklist (ChecklistId, ProjectId),
        CONSTRAINT UQ_ChecklistItem_Checklist UNIQUE (ChecklistItemId, ChecklistId),
        CONSTRAINT CK_ChecklistItem_Done CHECK (
            (IsDone = 1 AND DoneAtUtc IS NOT NULL AND DoneBy IS NOT NULL)
            OR (IsDone = 0 AND DoneAtUtc IS NULL AND DoneBy IS NULL))
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ChecklistItem_List'
                 AND object_id = OBJECT_ID(N'app.ChecklistItem'))
    CREATE INDEX IX_ChecklistItem_List
        ON app.ChecklistItem (ChecklistId, IsDeleted, SortOrder) INCLUDE (Title, IsDone);
GO

IF OBJECT_ID(N'app.ChecklistCell', N'U') IS NULL
    CREATE TABLE app.ChecklistCell (
        ChecklistCellId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ChecklistCell PRIMARY KEY,
        ChecklistItemId   INT NOT NULL,
        ChecklistColumnId INT NOT NULL,
        ChecklistId       INT NOT NULL,
        TextValue    NVARCHAR(2000) NULL,
        DateValue    DATE NULL,
        LinkUrl      NVARCHAR(2048) NULL,
        SignedAtUtc  DATETIME2 NULL,
        SignedBy     INT NULL,
        TodoItemId   INT NULL CONSTRAINT FK_ChecklistCell_TodoItem REFERENCES app.TodoItem (TodoItemId),
        UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_ChecklistCell_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
        UpdatedBy    INT NOT NULL,
        CONSTRAINT UQ_ChecklistCell UNIQUE (ChecklistItemId, ChecklistColumnId),
        CONSTRAINT FK_ChecklistCell_Item FOREIGN KEY (ChecklistItemId, ChecklistId)
            REFERENCES app.ChecklistItem (ChecklistItemId, ChecklistId),
        CONSTRAINT FK_ChecklistCell_Column FOREIGN KEY (ChecklistColumnId, ChecklistId)
            REFERENCES app.ChecklistColumn (ChecklistColumnId, ChecklistId),
        CONSTRAINT CK_ChecklistCell_Signed CHECK (
            (SignedAtUtc IS NULL AND SignedBy IS NULL) OR (SignedAtUtc IS NOT NULL AND SignedBy IS NOT NULL)),
        CONSTRAINT CK_ChecklistCell_Link CHECK (
            LinkUrl IS NULL OR LinkUrl LIKE N'http://_%' OR LinkUrl LIKE N'https://_%'),
        CONSTRAINT CK_ChecklistCell_OneValue CHECK (
            CASE WHEN TextValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN DateValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN LinkUrl   IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN SignedAtUtc IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN TodoItemId IS NOT NULL THEN 1 ELSE 0 END = 1)
    );
GO
