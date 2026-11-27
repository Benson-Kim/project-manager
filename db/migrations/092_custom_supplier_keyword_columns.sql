-- 092_custom_supplier_keyword_columns.sql — a project's own column names and added columns on the supplier
-- and keyword datasheets, the same shape as the daily activity and to-do registers (091).
-- app.<Entity>Label renames a built-in column by its stable key; app.<Entity>Column, ColumnOption and Cell
-- hold the added columns, their choice options and one value per row and column. Cells exist only for rows
-- that belong to a project: the composite keys tie the row, the column and the option to one project.
-- Additive and idempotent.
USE ProjectManager;
GO

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_Supplier_Project'
                 AND parent_object_id = OBJECT_ID(N'app.Supplier'))
    ALTER TABLE app.Supplier ADD CONSTRAINT UQ_Supplier_Project UNIQUE (SupplierId, ProjectId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_Keyword_Project'
                 AND parent_object_id = OBJECT_ID(N'app.Keyword'))
    ALTER TABLE app.Keyword ADD CONSTRAINT UQ_Keyword_Project UNIQUE (KeywordId, ProjectId);
GO

IF OBJECT_ID(N'app.SupplierLabel', N'U') IS NULL
    CREATE TABLE app.SupplierLabel (
        SupplierLabelId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SupplierLabel PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_SupplierLabel_Project REFERENCES app.Project (ProjectId),
        ColumnKey    VARCHAR(64) NOT NULL CONSTRAINT CK_SupplierLabel_Key CHECK (LEN(ColumnKey) > 0),
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_SupplierLabel_Label CHECK (LEN(Label) > 0),
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_SupplierLabel_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_SupplierLabel UNIQUE (ProjectId, ColumnKey)
    );
GO

IF OBJECT_ID(N'app.SupplierColumn', N'U') IS NULL
    CREATE TABLE app.SupplierColumn (
        SupplierColumnId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SupplierColumn PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_SupplierColumn_Project REFERENCES app.Project (ProjectId),
        Name         NVARCHAR(80) NOT NULL CONSTRAINT CK_SupplierColumn_Name CHECK (LEN(Name) > 0),
        Kind         VARCHAR(20) NOT NULL
            CONSTRAINT CK_SupplierColumn_Kind CHECK (Kind IN ('date', 'text', 'document', 'choice')),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_SupplierColumn_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_SupplierColumn_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_SupplierColumn_Project UNIQUE (SupplierColumnId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SupplierColumn_Name'
                 AND object_id = OBJECT_ID(N'app.SupplierColumn'))
    CREATE UNIQUE INDEX UX_SupplierColumn_Name
        ON app.SupplierColumn (ProjectId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.SupplierColumnOption', N'U') IS NULL
    CREATE TABLE app.SupplierColumnOption (
        SupplierColumnOptionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SupplierColumnOption PRIMARY KEY,
        SupplierColumnId INT NOT NULL,
        ProjectId    INT NOT NULL,
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_SupplierColumnOption_Label CHECK (LEN(Label) > 0),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_SupplierColumnOption_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_SupplierColumnOption_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT FK_SupplierColumnOption_Column FOREIGN KEY (SupplierColumnId, ProjectId)
            REFERENCES app.SupplierColumn (SupplierColumnId, ProjectId),
        CONSTRAINT UQ_SupplierColumnOption_Column UNIQUE (SupplierColumnOptionId, SupplierColumnId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SupplierColumnOption_Label'
                 AND object_id = OBJECT_ID(N'app.SupplierColumnOption'))
    CREATE UNIQUE INDEX UX_SupplierColumnOption_Label
        ON app.SupplierColumnOption (SupplierColumnId, Label) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.SupplierCell', N'U') IS NULL
    CREATE TABLE app.SupplierCell (
        SupplierCellId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SupplierCell PRIMARY KEY,
        SupplierId       INT NOT NULL,
        SupplierColumnId INT NOT NULL,
        ProjectId           INT NOT NULL,
        TextValue    NVARCHAR(2000) NULL,
        DateValue    DATE NULL,
        LinkUrl      NVARCHAR(2048) NULL,
        OptionId     INT NULL,
        UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_SupplierCell_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
        UpdatedBy    INT NOT NULL,
        CONSTRAINT UQ_SupplierCell UNIQUE (SupplierId, SupplierColumnId),
        CONSTRAINT FK_SupplierCell_Supplier FOREIGN KEY (SupplierId, ProjectId)
            REFERENCES app.Supplier (SupplierId, ProjectId),
        CONSTRAINT FK_SupplierCell_Column FOREIGN KEY (SupplierColumnId, ProjectId)
            REFERENCES app.SupplierColumn (SupplierColumnId, ProjectId),
        CONSTRAINT FK_SupplierCell_Option FOREIGN KEY (OptionId, SupplierColumnId)
            REFERENCES app.SupplierColumnOption (SupplierColumnOptionId, SupplierColumnId),
        CONSTRAINT CK_SupplierCell_Link CHECK (
            LinkUrl IS NULL OR LinkUrl LIKE N'http://_%' OR LinkUrl LIKE N'https://_%'),
        CONSTRAINT CK_SupplierCell_OneValue CHECK (
            CASE WHEN TextValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN DateValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN LinkUrl   IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN OptionId  IS NOT NULL THEN 1 ELSE 0 END = 1)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SupplierCell_Option'
                 AND object_id = OBJECT_ID(N'app.SupplierCell'))
    CREATE INDEX IX_SupplierCell_Option
        ON app.SupplierCell (SupplierColumnId, OptionId) INCLUDE (SupplierId);
GO

IF OBJECT_ID(N'app.KeywordLabel', N'U') IS NULL
    CREATE TABLE app.KeywordLabel (
        KeywordLabelId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KeywordLabel PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_KeywordLabel_Project REFERENCES app.Project (ProjectId),
        ColumnKey    VARCHAR(64) NOT NULL CONSTRAINT CK_KeywordLabel_Key CHECK (LEN(ColumnKey) > 0),
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_KeywordLabel_Label CHECK (LEN(Label) > 0),
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_KeywordLabel_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_KeywordLabel UNIQUE (ProjectId, ColumnKey)
    );
GO

IF OBJECT_ID(N'app.KeywordColumn', N'U') IS NULL
    CREATE TABLE app.KeywordColumn (
        KeywordColumnId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KeywordColumn PRIMARY KEY,
        ProjectId    INT NOT NULL CONSTRAINT FK_KeywordColumn_Project REFERENCES app.Project (ProjectId),
        Name         NVARCHAR(80) NOT NULL CONSTRAINT CK_KeywordColumn_Name CHECK (LEN(Name) > 0),
        Kind         VARCHAR(20) NOT NULL
            CONSTRAINT CK_KeywordColumn_Kind CHECK (Kind IN ('date', 'text', 'document', 'choice')),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_KeywordColumn_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_KeywordColumn_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT UQ_KeywordColumn_Project UNIQUE (KeywordColumnId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_KeywordColumn_Name'
                 AND object_id = OBJECT_ID(N'app.KeywordColumn'))
    CREATE UNIQUE INDEX UX_KeywordColumn_Name
        ON app.KeywordColumn (ProjectId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.KeywordColumnOption', N'U') IS NULL
    CREATE TABLE app.KeywordColumnOption (
        KeywordColumnOptionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KeywordColumnOption PRIMARY KEY,
        KeywordColumnId INT NOT NULL,
        ProjectId    INT NOT NULL,
        Label        NVARCHAR(80) NOT NULL CONSTRAINT CK_KeywordColumnOption_Label CHECK (LEN(Label) > 0),
        SortOrder    INT NOT NULL,
        IsDeleted    BIT NOT NULL CONSTRAINT DF_KeywordColumnOption_IsDeleted DEFAULT 0,
        DeletedAtUtc DATETIME2 NULL,
        DeletedBy    INT NULL,
        CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_KeywordColumnOption_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy    INT NOT NULL,
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION,
        CONSTRAINT FK_KeywordColumnOption_Column FOREIGN KEY (KeywordColumnId, ProjectId)
            REFERENCES app.KeywordColumn (KeywordColumnId, ProjectId),
        CONSTRAINT UQ_KeywordColumnOption_Column UNIQUE (KeywordColumnOptionId, KeywordColumnId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_KeywordColumnOption_Label'
                 AND object_id = OBJECT_ID(N'app.KeywordColumnOption'))
    CREATE UNIQUE INDEX UX_KeywordColumnOption_Label
        ON app.KeywordColumnOption (KeywordColumnId, Label) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.KeywordCell', N'U') IS NULL
    CREATE TABLE app.KeywordCell (
        KeywordCellId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KeywordCell PRIMARY KEY,
        KeywordId       INT NOT NULL,
        KeywordColumnId INT NOT NULL,
        ProjectId           INT NOT NULL,
        TextValue    NVARCHAR(2000) NULL,
        DateValue    DATE NULL,
        LinkUrl      NVARCHAR(2048) NULL,
        OptionId     INT NULL,
        UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_KeywordCell_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
        UpdatedBy    INT NOT NULL,
        CONSTRAINT UQ_KeywordCell UNIQUE (KeywordId, KeywordColumnId),
        CONSTRAINT FK_KeywordCell_Keyword FOREIGN KEY (KeywordId, ProjectId)
            REFERENCES app.Keyword (KeywordId, ProjectId),
        CONSTRAINT FK_KeywordCell_Column FOREIGN KEY (KeywordColumnId, ProjectId)
            REFERENCES app.KeywordColumn (KeywordColumnId, ProjectId),
        CONSTRAINT FK_KeywordCell_Option FOREIGN KEY (OptionId, KeywordColumnId)
            REFERENCES app.KeywordColumnOption (KeywordColumnOptionId, KeywordColumnId),
        CONSTRAINT CK_KeywordCell_Link CHECK (
            LinkUrl IS NULL OR LinkUrl LIKE N'http://_%' OR LinkUrl LIKE N'https://_%'),
        CONSTRAINT CK_KeywordCell_OneValue CHECK (
            CASE WHEN TextValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN DateValue IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN LinkUrl   IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN OptionId  IS NOT NULL THEN 1 ELSE 0 END = 1)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_KeywordCell_Option'
                 AND object_id = OBJECT_ID(N'app.KeywordCell'))
    CREATE INDEX IX_KeywordCell_Option
        ON app.KeywordCell (KeywordColumnId, OptionId) INCLUDE (KeywordId);
GO
