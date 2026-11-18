-- 086_whiteboards.sql — free-form whiteboards, several per project.
-- app.Whiteboard: one named board. The drawing is one JSON scene (version, elements, a few view
--   settings), written whole on every save under the row version, so two people on one board get a
--   409 instead of overwriting each other. The checks hold the scene to valid JSON of at most
--   800,000 characters; the app validates its shape before it reaches the proc. Names are unique
--   per project among rows not deleted. Additive, so an older build ignores the table.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.Whiteboard', N'U') IS NULL
    CREATE TABLE app.Whiteboard (
        WhiteboardId  INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_Whiteboard PRIMARY KEY,
        ProjectId     INT NOT NULL
            CONSTRAINT FK_Whiteboard_Project REFERENCES app.Project (ProjectId),
        Name          NVARCHAR(120) NOT NULL
            CONSTRAINT CK_Whiteboard_Name CHECK (LEN(Name) > 0),
        BoardJson     NVARCHAR(MAX) NOT NULL
            CONSTRAINT CK_Whiteboard_Json CHECK (ISJSON(BoardJson) = 1 AND LEN(BoardJson) <= 800000),
        IsDeleted     BIT NOT NULL CONSTRAINT DF_Whiteboard_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL
            CONSTRAINT DF_Whiteboard_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Whiteboard_Name'
                 AND object_id = OBJECT_ID(N'app.Whiteboard'))
    CREATE UNIQUE INDEX UX_Whiteboard_Name
        ON app.Whiteboard (ProjectId, Name) WHERE IsDeleted = 0;
GO
