-- 072_bpmn_diagrams.sql — process diagrams drawn with BPMN symbols, several per project (ADR-0064).
-- app.BpmnDiagram: one named diagram. The drawing is one JSON document (pools, lanes, shapes,
--   flows), written whole on every save under the row version, so two people on one diagram get a
--   409 instead of overwriting each other. The checks hold the document to valid JSON of at most
--   300,000 characters; the app validates its shape before it reaches the proc. Names are unique
--   per project among rows not deleted. Additive, so an older build ignores the table.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.BpmnDiagram', N'U') IS NULL
    CREATE TABLE app.BpmnDiagram (
        BpmnDiagramId INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_BpmnDiagram PRIMARY KEY,
        ProjectId     INT NOT NULL
            CONSTRAINT FK_BpmnDiagram_Project REFERENCES app.Project (ProjectId),
        Name          NVARCHAR(120) NOT NULL
            CONSTRAINT CK_BpmnDiagram_Name CHECK (LEN(Name) > 0),
        DiagramJson   NVARCHAR(MAX) NOT NULL
            CONSTRAINT CK_BpmnDiagram_Json CHECK (ISJSON(DiagramJson) = 1 AND LEN(DiagramJson) <= 300000),
        IsDeleted     BIT NOT NULL CONSTRAINT DF_BpmnDiagram_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL
            CONSTRAINT DF_BpmnDiagram_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_BpmnDiagram_Name'
                 AND object_id = OBJECT_ID(N'app.BpmnDiagram'))
    CREATE UNIQUE INDEX UX_BpmnDiagram_Name
        ON app.BpmnDiagram (ProjectId, Name) WHERE IsDeleted = 0;
GO
