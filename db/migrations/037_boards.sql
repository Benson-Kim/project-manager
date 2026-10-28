-- 037_boards.sql - kanban/scrum boards: the board, its columns, and the phases and sprints that
-- plan it (ADR-0038).
--   app.Board: a board either belongs to a project (ProjectId, which may change later) or stands
--     alone (NULL), the shared space every user may work. Access is resolved per row by
--     dbo.ufn_Board_AccessLevel, never stored.
--   app.BoardColumn: the board's columns, left to right by SortOrder. Category groups them for the
--     sprint rules (only a done column finishes a card). WipLimit NULL means no limit.
--   app.BoardPhase: an optional grouping of sprints, with its own dates.
--   app.BoardSprint: a sprint of the board, optionally inside a phase. State moves
--     planned -> active -> completed and never back; the stamps match the state, and at most one
--     sprint of a board is active at a time (filtered unique index).
--   Cross-board ids are impossible: every child carries BoardId and reaches its siblings through a
--     composite foreign key built on UNIQUE (BoardId, <child>Id), so the database refuses a sprint
--     in another board's phase.
--   app.BoardCard is NOT here. Its RequirementId references app.Requirement, which arrives with the
--     requirement register (migration 036); the cards table and that foreign key land together in
--     the next boards migration.
--   pm_web needs no grant: GRANT EXECUTE ON SCHEMA::dbo (db/security/app-login.sql) covers the procs,
--     and the application never reads these tables directly.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.Board', N'U') IS NULL
BEGIN
    CREATE TABLE app.Board (
        BoardId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Board PRIMARY KEY,
        ProjectId     INT NULL CONSTRAINT FK_Board_Project REFERENCES app.Project (ProjectId),
        [Name]        NVARCHAR(200) NOT NULL,
        [Description] NVARCHAR(2000) NULL,
        IsDeleted     BIT NOT NULL CONSTRAINT DF_Board_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Board_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Board_Project' AND object_id = OBJECT_ID(N'app.Board'))
    CREATE INDEX IX_Board_Project ON app.Board (ProjectId, IsDeleted) INCLUDE ([Name], RowVer);
GO

IF OBJECT_ID(N'app.BoardColumn', N'U') IS NULL
BEGIN
    CREATE TABLE app.BoardColumn (
        BoardColumnId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BoardColumn PRIMARY KEY,
        BoardId       INT NOT NULL CONSTRAINT FK_BoardColumn_Board REFERENCES app.Board (BoardId),
        [Name]        NVARCHAR(60) NOT NULL,
        Category      VARCHAR(10) NOT NULL
            CONSTRAINT CK_BoardColumn_Category CHECK (Category IN ('todo', 'doing', 'done')),
        WipLimit      INT NULL CONSTRAINT CK_BoardColumn_WipLimit CHECK (WipLimit BETWEEN 1 AND 999),
        SortOrder     INT NOT NULL CONSTRAINT DF_BoardColumn_SortOrder DEFAULT 0,
        IsDeleted     BIT NOT NULL CONSTRAINT DF_BoardColumn_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_BoardColumn_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION,
        -- The target a card's composite foreign key points at, so a card cannot name another
        -- board's column.
        CONSTRAINT UQ_BoardColumn_Board UNIQUE (BoardId, BoardColumnId)
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BoardColumn_Board' AND object_id = OBJECT_ID(N'app.BoardColumn'))
    CREATE INDEX IX_BoardColumn_Board ON app.BoardColumn (BoardId, IsDeleted, SortOrder)
        INCLUDE ([Name], Category, WipLimit);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_BoardColumn_Name' AND object_id = OBJECT_ID(N'app.BoardColumn'))
    CREATE UNIQUE INDEX UQ_BoardColumn_Name ON app.BoardColumn (BoardId, [Name]) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.BoardPhase', N'U') IS NULL
BEGIN
    CREATE TABLE app.BoardPhase (
        BoardPhaseId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BoardPhase PRIMARY KEY,
        BoardId       INT NOT NULL CONSTRAINT FK_BoardPhase_Board REFERENCES app.Board (BoardId),
        [Name]        NVARCHAR(100) NOT NULL,
        StartDate     DATE NULL,
        EndDate       DATE NULL,
        SortOrder     INT NOT NULL CONSTRAINT DF_BoardPhase_SortOrder DEFAULT 0,
        IsDeleted     BIT NOT NULL CONSTRAINT DF_BoardPhase_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_BoardPhase_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION,
        CONSTRAINT CK_BoardPhase_Dates CHECK (EndDate IS NULL OR StartDate IS NULL OR EndDate >= StartDate),
        CONSTRAINT UQ_BoardPhase_Board UNIQUE (BoardId, BoardPhaseId)
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BoardPhase_Board' AND object_id = OBJECT_ID(N'app.BoardPhase'))
    CREATE INDEX IX_BoardPhase_Board ON app.BoardPhase (BoardId, IsDeleted, SortOrder) INCLUDE ([Name]);
GO

IF OBJECT_ID(N'app.BoardSprint', N'U') IS NULL
BEGIN
    CREATE TABLE app.BoardSprint (
        BoardSprintId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BoardSprint PRIMARY KEY,
        BoardId        INT NOT NULL CONSTRAINT FK_BoardSprint_Board REFERENCES app.Board (BoardId),
        BoardPhaseId   INT NULL,
        [Name]         NVARCHAR(100) NOT NULL,
        Goal           NVARCHAR(1000) NULL,
        StartDate      DATE NOT NULL,
        EndDate        DATE NOT NULL,
        [State]        VARCHAR(10) NOT NULL
            CONSTRAINT DF_BoardSprint_State DEFAULT 'planned'
            CONSTRAINT CK_BoardSprint_State CHECK ([State] IN ('planned', 'active', 'completed')),
        StartedAtUtc   DATETIME2 NULL,
        CompletedAtUtc DATETIME2 NULL,
        IsDeleted      BIT NOT NULL CONSTRAINT DF_BoardSprint_IsDeleted DEFAULT 0,
        DeletedAtUtc   DATETIME2 NULL,
        DeletedBy      INT NULL,
        CreatedAtUtc   DATETIME2 NOT NULL CONSTRAINT DF_BoardSprint_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy      INT NOT NULL,
        UpdatedAtUtc   DATETIME2 NULL,
        UpdatedBy      INT NULL,
        RowVer         ROWVERSION,
        -- A sprint groups under a phase of its OWN board.
        CONSTRAINT FK_BoardSprint_Phase FOREIGN KEY (BoardId, BoardPhaseId)
            REFERENCES app.BoardPhase (BoardId, BoardPhaseId),
        CONSTRAINT CK_BoardSprint_Dates CHECK (EndDate >= StartDate),
        -- The stamps follow the state, so a completed sprint can always say when it ran.
        CONSTRAINT CK_BoardSprint_StateStamps CHECK (
            ([State] = 'planned'   AND StartedAtUtc IS NULL     AND CompletedAtUtc IS NULL)
         OR ([State] = 'active'    AND StartedAtUtc IS NOT NULL AND CompletedAtUtc IS NULL)
         OR ([State] = 'completed' AND StartedAtUtc IS NOT NULL AND CompletedAtUtc IS NOT NULL)),
        CONSTRAINT UQ_BoardSprint_Board UNIQUE (BoardId, BoardSprintId)
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BoardSprint_Board' AND object_id = OBJECT_ID(N'app.BoardSprint'))
    CREATE INDEX IX_BoardSprint_Board ON app.BoardSprint (BoardId, IsDeleted, StartDate)
        INCLUDE ([Name], [State], BoardPhaseId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BoardSprint_Phase' AND object_id = OBJECT_ID(N'app.BoardSprint'))
    CREATE INDEX IX_BoardSprint_Phase ON app.BoardSprint (BoardPhaseId, IsDeleted);
GO
-- At most one active sprint per board: the rule the Start proc checks under the board lock, backed
-- here so a race cannot leave two.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_BoardSprint_Active' AND object_id = OBJECT_ID(N'app.BoardSprint'))
    CREATE UNIQUE INDEX UQ_BoardSprint_Active ON app.BoardSprint (BoardId)
        WHERE [State] = 'active' AND IsDeleted = 0;
GO
