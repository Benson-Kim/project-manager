-- 091_custom_activity_todo_columns.sql — a project's own column names and added columns on the daily
-- activity and to-do datasheets, the same shape as the requirement register's (074).
-- app.<Entity>Label renames a built-in column by its stable key; app.<Entity>Column, ColumnOption and Cell
-- hold the added columns, their choice options and one value per row and column. Cells exist only for rows
-- that belong to a project: the composite keys tie the row, the column and the option to one project.
-- Additive and idempotent.
USE ProjectManager;
GO

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_DailyActivity_Project'
                 AND parent_object_id = OBJECT_ID(N'app.DailyActivity'))
    ALTER TABLE app.DailyActivity ADD CONSTRAINT UQ_DailyActivity_Project UNIQUE (DailyActivityId, ProjectId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_TodoItem_Project'
                 AND parent_object_id = OBJECT_ID(N'app.TodoItem'))
    ALTER TABLE app.TodoItem ADD CONSTRAINT UQ_TodoItem_Project UNIQUE (TodoItemId, ProjectId);
GO

IF OBJECT_ID(N'app.DailyActivityLabel', N'U') IS NULL
    CREATE TABLE app.DailyActivityLabel (
        DailyActivityLabelId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DailyActivityLabel PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_DailyActivityLabel_Project REFERENCES app.Project (ProjectId),
        ColumnKey    VARCHAR(64) NOT NULL CONSTRAINT CK_DailyActivityLabel_Key CHECK (LEN(ColumnKey) > 0),
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_DailyActivityLabel_Label CHECK (LEN(Label) > 0),
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_DailyActivityLabel_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_DailyActivityLabel UNIQUE (ProjectId, ColumnKey)
    );
GO

IF OBJECT_ID(N'app.DailyActivityColumn', N'U') IS NULL
    CREATE TABLE app.DailyActivityColumn (
        DailyActivityColumnId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DailyActivityColumn PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_DailyActivityColumn_Project REFERENCES app.Project (ProjectId),
        Name         NVARCHAR(80) NOT NULL CONSTRAINT CK_DailyActivityColumn_Name CHECK (LEN(Name) > 0),
        Kind         VARCHAR(20) NOT NULL
            CONSTRAINT CK_DailyActivityColumn_Kind CHECK (Kind IN ('date', 'text', 'document', 'choice')),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_DailyActivityColumn_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_DailyActivityColumn_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_DailyActivityColumn_Project UNIQUE (DailyActivityColumnId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_DailyActivityColumn_Name'
                 AND object_id = OBJECT_ID(N'app.DailyActivityColumn'))
    CREATE UNIQUE INDEX UX_DailyActivityColumn_Name
        ON app.DailyActivityColumn (ProjectId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.DailyActivityColumnOption', N'U') IS NULL
    CREATE TABLE app.DailyActivityColumnOption (
        DailyActivityColumnOptionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DailyActivityColumnOption PRIMARY KEY,
        DailyActivityColumnId INT NOT NULL,
        ProjectId    INT NOT NULL,
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_DailyActivityColumnOption_Label CHECK (LEN(Label) > 0),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_DailyActivityColumnOption_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_DailyActivityColumnOption_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT FK_DailyActivityColumnOption_Column FOREIGN KEY (DailyActivityColumnId, ProjectId)
            REFERENCES app.DailyActivityColumn (DailyActivityColumnId, ProjectId),
        CONSTRAINT UQ_DailyActivityColumnOption_Column UNIQUE (DailyActivityColumnOptionId, DailyActivityColumnId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_DailyActivityColumnOption_Label'
                 AND object_id = OBJECT_ID(N'app.DailyActivityColumnOption'))
    CREATE UNIQUE INDEX UX_DailyActivityColumnOption_Label
        ON app.DailyActivityColumnOption (DailyActivityColumnId, Label) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.DailyActivityCell', N'U') IS NULL
    CREATE TABLE app.DailyActivityCell (
        DailyActivityCellId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DailyActivityCell PRIMARY KEY,
        DailyActivityId       INT NOT NULL,
        DailyActivityColumnId INT NOT NULL,
        ProjectId           INT NOT NULL,
        TextValue    NVARCHAR(2000) NULL,
        DateValue    DATE NULL,
        LinkUrl      NVARCHAR(2048) NULL,
        OptionId     INT NULL,
        UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_DailyActivityCell_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
        UpdatedBy    INT NOT NULL,
        CONSTRAINT UQ_DailyActivityCell UNIQUE (DailyActivityId, DailyActivityColumnId),
        CONSTRAINT FK_DailyActivityCell_DailyActivity FOREIGN KEY (DailyActivityId, ProjectId)
            REFERENCES app.DailyActivity (DailyActivityId, ProjectId),
        CONSTRAINT FK_DailyActivityCell_Column FOREIGN KEY (DailyActivityColumnId, ProjectId)
            REFERENCES app.DailyActivityColumn (DailyActivityColumnId, ProjectId),
        CONSTRAINT FK_DailyActivityCell_Option FOREIGN KEY (OptionId, DailyActivityColumnId)
            REFERENCES app.DailyActivityColumnOption (DailyActivityColumnOptionId, DailyActivityColumnId),
        CONSTRAINT CK_DailyActivityCell_Link CHECK (
            LinkUrl IS NULL OR LinkUrl LIKE N'http://_%' OR LinkUrl LIKE N'https://_%'),
        CONSTRAINT CK_DailyActivityCell_OneValue CHECK (
            CASE WHEN TextValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN DateValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN LinkUrl   IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN OptionId  IS NOT NULL THEN 1 ELSE 0 END = 1)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DailyActivityCell_Option'
                 AND object_id = OBJECT_ID(N'app.DailyActivityCell'))
    CREATE INDEX IX_DailyActivityCell_Option
        ON app.DailyActivityCell (DailyActivityColumnId, OptionId) INCLUDE (DailyActivityId);
GO

IF OBJECT_ID(N'app.TodoItemLabel', N'U') IS NULL
    CREATE TABLE app.TodoItemLabel (
        TodoItemLabelId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TodoItemLabel PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_TodoItemLabel_Project REFERENCES app.Project (ProjectId),
        ColumnKey    VARCHAR(64) NOT NULL CONSTRAINT CK_TodoItemLabel_Key CHECK (LEN(ColumnKey) > 0),
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_TodoItemLabel_Label CHECK (LEN(Label) > 0),
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_TodoItemLabel_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_TodoItemLabel UNIQUE (ProjectId, ColumnKey)
    );
GO

IF OBJECT_ID(N'app.TodoItemColumn', N'U') IS NULL
    CREATE TABLE app.TodoItemColumn (
        TodoItemColumnId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TodoItemColumn PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_TodoItemColumn_Project REFERENCES app.Project (ProjectId),
        Name         NVARCHAR(80) NOT NULL CONSTRAINT CK_TodoItemColumn_Name CHECK (LEN(Name) > 0),
        Kind         VARCHAR(20) NOT NULL
            CONSTRAINT CK_TodoItemColumn_Kind CHECK (Kind IN ('date', 'text', 'document', 'choice')),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_TodoItemColumn_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_TodoItemColumn_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_TodoItemColumn_Project UNIQUE (TodoItemColumnId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_TodoItemColumn_Name'
                 AND object_id = OBJECT_ID(N'app.TodoItemColumn'))
    CREATE UNIQUE INDEX UX_TodoItemColumn_Name
        ON app.TodoItemColumn (ProjectId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.TodoItemColumnOption', N'U') IS NULL
    CREATE TABLE app.TodoItemColumnOption (
        TodoItemColumnOptionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TodoItemColumnOption PRIMARY KEY,
        TodoItemColumnId INT NOT NULL,
        ProjectId    INT NOT NULL,
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_TodoItemColumnOption_Label CHECK (LEN(Label) > 0),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_TodoItemColumnOption_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_TodoItemColumnOption_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT FK_TodoItemColumnOption_Column FOREIGN KEY (TodoItemColumnId, ProjectId)
            REFERENCES app.TodoItemColumn (TodoItemColumnId, ProjectId),
        CONSTRAINT UQ_TodoItemColumnOption_Column UNIQUE (TodoItemColumnOptionId, TodoItemColumnId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_TodoItemColumnOption_Label'
                 AND object_id = OBJECT_ID(N'app.TodoItemColumnOption'))
    CREATE UNIQUE INDEX UX_TodoItemColumnOption_Label
        ON app.TodoItemColumnOption (TodoItemColumnId, Label) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.TodoItemCell', N'U') IS NULL
    CREATE TABLE app.TodoItemCell (
        TodoItemCellId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TodoItemCell PRIMARY KEY,
        TodoItemId       INT NOT NULL,
        TodoItemColumnId INT NOT NULL,
        ProjectId           INT NOT NULL,
        TextValue    NVARCHAR(2000) NULL,
        DateValue    DATE NULL,
        LinkUrl      NVARCHAR(2048) NULL,
        OptionId     INT NULL,
        UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_TodoItemCell_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
        UpdatedBy    INT NOT NULL,
        CONSTRAINT UQ_TodoItemCell UNIQUE (TodoItemId, TodoItemColumnId),
        CONSTRAINT FK_TodoItemCell_TodoItem FOREIGN KEY (TodoItemId, ProjectId)
            REFERENCES app.TodoItem (TodoItemId, ProjectId),
        CONSTRAINT FK_TodoItemCell_Column FOREIGN KEY (TodoItemColumnId, ProjectId)
            REFERENCES app.TodoItemColumn (TodoItemColumnId, ProjectId),
        CONSTRAINT FK_TodoItemCell_Option FOREIGN KEY (OptionId, TodoItemColumnId)
            REFERENCES app.TodoItemColumnOption (TodoItemColumnOptionId, TodoItemColumnId),
        CONSTRAINT CK_TodoItemCell_Link CHECK (
            LinkUrl IS NULL OR LinkUrl LIKE N'http://_%' OR LinkUrl LIKE N'https://_%'),
        CONSTRAINT CK_TodoItemCell_OneValue CHECK (
            CASE WHEN TextValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN DateValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN LinkUrl   IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN OptionId  IS NOT NULL THEN 1 ELSE 0 END = 1)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TodoItemCell_Option'
                 AND object_id = OBJECT_ID(N'app.TodoItemCell'))
    CREATE INDEX IX_TodoItemCell_Option
        ON app.TodoItemCell (TodoItemColumnId, OptionId) INCLUDE (TodoItemId);
GO
