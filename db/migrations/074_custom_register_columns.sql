-- 074_custom_register_columns.sql — the requirement register's own column names and added columns,
-- per project (ADR-0067; the column kinds are ADR-0066's).
-- app.RequirementLabel: a project's name for one built-in column, keyed by the column's stable key.
--   A rename only ever writes this row; clearing it brings the default name back. No data, filter,
--   sort, saved view or export reads it: they all use the stable key.
-- app.RequirementColumn: a column the project added (date, text, web link or choice list). Values
--   are keyed by the column's id, so a rename never moves them; a delete is soft and leaves them in
--   place, recoverable. The kind changes only while the column holds no value.
-- app.RequirementColumnOption: a choice column's options. A cell holds the option's id, so renaming
--   an option carries every value and filter with it; an option in use cannot be deleted.
-- app.RequirementCell: one value per requirement and column, in the slot its kind uses; an empty
--   cell has no row. Composite keys hold the requirement, the column and the option in one project.
-- Additive and idempotent.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.RequirementLabel', N'U') IS NULL
    CREATE TABLE app.RequirementLabel (
        RequirementLabelId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RequirementLabel PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_RequirementLabel_Project REFERENCES app.Project (ProjectId),
        ColumnKey    VARCHAR(64) NOT NULL CONSTRAINT CK_RequirementLabel_Key CHECK (LEN(ColumnKey) > 0),
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_RequirementLabel_Label CHECK (LEN(Label) > 0),
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_RequirementLabel_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_RequirementLabel UNIQUE (ProjectId, ColumnKey)
    );
GO

IF OBJECT_ID(N'app.RequirementColumn', N'U') IS NULL
    CREATE TABLE app.RequirementColumn (
        RequirementColumnId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RequirementColumn PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_RequirementColumn_Project REFERENCES app.Project (ProjectId),
        Name         NVARCHAR(80) NOT NULL CONSTRAINT CK_RequirementColumn_Name CHECK (LEN(Name) > 0),
        Kind         VARCHAR(20) NOT NULL
            CONSTRAINT CK_RequirementColumn_Kind CHECK (Kind IN ('date', 'text', 'document', 'choice')),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_RequirementColumn_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_RequirementColumn_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_RequirementColumn_Project UNIQUE (RequirementColumnId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RequirementColumn_Name'
                 AND object_id = OBJECT_ID(N'app.RequirementColumn'))
    CREATE UNIQUE INDEX UX_RequirementColumn_Name
        ON app.RequirementColumn (ProjectId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.RequirementColumnOption', N'U') IS NULL
    CREATE TABLE app.RequirementColumnOption (
        RequirementColumnOptionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RequirementColumnOption PRIMARY KEY,
        RequirementColumnId INT NOT NULL,
        ProjectId    INT NOT NULL,
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_RequirementColumnOption_Label CHECK (LEN(Label) > 0),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_RequirementColumnOption_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_RequirementColumnOption_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT FK_RequirementColumnOption_Column FOREIGN KEY (RequirementColumnId, ProjectId)
            REFERENCES app.RequirementColumn (RequirementColumnId, ProjectId),
        CONSTRAINT UQ_RequirementColumnOption_Column UNIQUE (RequirementColumnOptionId, RequirementColumnId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RequirementColumnOption_Label'
                 AND object_id = OBJECT_ID(N'app.RequirementColumnOption'))
    CREATE UNIQUE INDEX UX_RequirementColumnOption_Label
        ON app.RequirementColumnOption (RequirementColumnId, Label) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.RequirementCell', N'U') IS NULL
    CREATE TABLE app.RequirementCell (
        RequirementCellId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RequirementCell PRIMARY KEY,
        RequirementId       INT NOT NULL,
        RequirementColumnId INT NOT NULL,
        ProjectId           INT NOT NULL,
        TextValue    NVARCHAR(2000) NULL,
        DateValue    DATE NULL,
        LinkUrl      NVARCHAR(2048) NULL,
        OptionId     INT NULL,
        UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_RequirementCell_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
        UpdatedBy    INT NOT NULL,
        CONSTRAINT UQ_RequirementCell UNIQUE (RequirementId, RequirementColumnId),
        CONSTRAINT FK_RequirementCell_Requirement FOREIGN KEY (RequirementId, ProjectId)
            REFERENCES app.Requirement (RequirementId, ProjectId),
        CONSTRAINT FK_RequirementCell_Column FOREIGN KEY (RequirementColumnId, ProjectId)
            REFERENCES app.RequirementColumn (RequirementColumnId, ProjectId),
        CONSTRAINT FK_RequirementCell_Option FOREIGN KEY (OptionId, RequirementColumnId)
            REFERENCES app.RequirementColumnOption (RequirementColumnOptionId, RequirementColumnId),
        CONSTRAINT CK_RequirementCell_Link CHECK (
            LinkUrl IS NULL OR LinkUrl LIKE N'http://_%' OR LinkUrl LIKE N'https://_%'),
        CONSTRAINT CK_RequirementCell_OneValue CHECK (
            CASE WHEN TextValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN DateValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN LinkUrl   IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN OptionId  IS NOT NULL THEN 1 ELSE 0 END = 1)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RequirementCell_Option'
                 AND object_id = OBJECT_ID(N'app.RequirementCell'))
    CREATE INDEX IX_RequirementCell_Option
        ON app.RequirementCell (RequirementColumnId, OptionId) INCLUDE (RequirementId);
GO
