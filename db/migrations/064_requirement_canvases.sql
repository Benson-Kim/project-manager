-- 064_requirement_canvases.sql — saved views of a project's requirements and WBS items (ADR-0061).
-- app.RequirementCanvas: a named view, filed under one WBS item or none. Names are unique per
--   project among rows not deleted.
-- app.RequirementCanvasNode: which items a canvas shows and where. NULL X, Y means auto layout
--   places the node; a value means someone arranged it by hand. The composite keys keep the canvas,
--   its filing and every node inside one project, as they do for allocations (migration 036).
-- A canvas is a view: nothing here points back from a requirement or a link, so removing a node
--   or deleting a canvas touches neither. Additive, so an older build ignores both tables.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.RequirementCanvas', N'U') IS NULL
    CREATE TABLE app.RequirementCanvas (
        RequirementCanvasId INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_RequirementCanvas PRIMARY KEY,
        ProjectId           INT NOT NULL
            CONSTRAINT FK_RequirementCanvas_Project REFERENCES app.Project (ProjectId),
        KeyDeliverableId    INT NULL,
        Name                NVARCHAR(120) NOT NULL
            CONSTRAINT CK_RequirementCanvas_Name CHECK (LEN(Name) > 0),
        IsDeleted           BIT NOT NULL CONSTRAINT DF_RequirementCanvas_IsDeleted DEFAULT 0,
        DeletedAtUtc        DATETIME2 NULL,
        DeletedBy           INT NULL,
        CreatedAtUtc        DATETIME2 NOT NULL
            CONSTRAINT DF_RequirementCanvas_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy           INT NOT NULL,
        UpdatedAtUtc        DATETIME2 NULL,
        UpdatedBy           INT NULL,
        RowVer              ROWVERSION,
        CONSTRAINT UQ_RequirementCanvas_Project UNIQUE (RequirementCanvasId, ProjectId),
        CONSTRAINT FK_RequirementCanvas_KeyDeliverable
            FOREIGN KEY (KeyDeliverableId, ProjectId)
            REFERENCES app.KeyDeliverable (KeyDeliverableId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RequirementCanvas_Name'
                 AND object_id = OBJECT_ID(N'app.RequirementCanvas'))
    CREATE UNIQUE INDEX UX_RequirementCanvas_Name
        ON app.RequirementCanvas (ProjectId, Name) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.RequirementCanvasNode', N'U') IS NULL
    CREATE TABLE app.RequirementCanvasNode (
        RequirementCanvasNodeId INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_RequirementCanvasNode PRIMARY KEY,
        RequirementCanvasId     INT NOT NULL,
        ProjectId               INT NOT NULL,
        RequirementId           INT NULL,
        KeyDeliverableId        INT NULL,
        X                       INT NULL,
        Y                       INT NULL,
        IsCollapsed             BIT NOT NULL
            CONSTRAINT DF_RequirementCanvasNode_IsCollapsed DEFAULT 0,
        CreatedAtUtc            DATETIME2 NOT NULL
            CONSTRAINT DF_RequirementCanvasNode_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy               INT NOT NULL,
        UpdatedAtUtc            DATETIME2 NULL,
        CONSTRAINT CK_RequirementCanvasNode_OneItem CHECK (
            (RequirementId IS NOT NULL AND KeyDeliverableId IS NULL)
            OR (RequirementId IS NULL AND KeyDeliverableId IS NOT NULL)),
        CONSTRAINT CK_RequirementCanvasNode_Position CHECK (
            (X IS NULL AND Y IS NULL) OR (X IS NOT NULL AND Y IS NOT NULL)),
        CONSTRAINT FK_RequirementCanvasNode_Canvas
            FOREIGN KEY (RequirementCanvasId, ProjectId)
            REFERENCES app.RequirementCanvas (RequirementCanvasId, ProjectId),
        CONSTRAINT FK_RequirementCanvasNode_Requirement
            FOREIGN KEY (RequirementId, ProjectId)
            REFERENCES app.Requirement (RequirementId, ProjectId),
        CONSTRAINT FK_RequirementCanvasNode_KeyDeliverable
            FOREIGN KEY (KeyDeliverableId, ProjectId)
            REFERENCES app.KeyDeliverable (KeyDeliverableId, ProjectId)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RequirementCanvasNode_Requirement'
                 AND object_id = OBJECT_ID(N'app.RequirementCanvasNode'))
    CREATE UNIQUE INDEX UX_RequirementCanvasNode_Requirement
        ON app.RequirementCanvasNode (RequirementCanvasId, RequirementId)
        WHERE RequirementId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_RequirementCanvasNode_KeyDeliverable'
                 AND object_id = OBJECT_ID(N'app.RequirementCanvasNode'))
    CREATE UNIQUE INDEX UX_RequirementCanvasNode_KeyDeliverable
        ON app.RequirementCanvasNode (RequirementCanvasId, KeyDeliverableId)
        WHERE KeyDeliverableId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RequirementCanvasNode_Canvas'
                 AND object_id = OBJECT_ID(N'app.RequirementCanvasNode'))
    CREATE INDEX IX_RequirementCanvasNode_Canvas
        ON app.RequirementCanvasNode (RequirementCanvasId)
        INCLUDE (RequirementId, KeyDeliverableId, X, Y, IsCollapsed);
GO
