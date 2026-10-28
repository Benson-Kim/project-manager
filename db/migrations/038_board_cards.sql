-- 038_board_cards.sql - the cards that move across a board (ADR-0038). Deferred out of migration
-- 037 because RequirementId references app.Requirement, which arrived with the requirement
-- register (migration 036); the table and that foreign key could only land together.
--   app.BoardCard: one unit of work. It sits in exactly one column, and in a sprint or, when
--     BoardSprintId is NULL, the backlog. A card carries a Title, a packaged requirement, or both:
--     a packaged card may show the requirement's own text instead of a title of its own.
--   Cross-board ids are impossible: BoardColumnId and BoardSprintId are reached through composite
--     foreign keys on (BoardId, <child>Id), so a card cannot name another board's column or sprint.
--     A NULL BoardSprintId skips its foreign key (a backlog card), which is what we want.
--   SortKey: ONE board-wide rank, so the board view and the planning view always agree on order.
--     The procs leave gaps of 2^20 between neighbours and renumber the board when a gap runs out.
--     It is BIGINT because repeated inserts at one spot halve the gap each time.
--   RequirementId has NO composite foreign key to the requirement's project. A board can be linked
--     to another project later, so "this board holds only its own project's requirements" is a rule
--     the Package and SetProject procs enforce under the board lock, not a constraint — a composite
--     key here would make a legitimate re-link impossible instead of merely checked.
--   Notes is rich text (ADR-0025), sanitised on the server and capped by the contract, not here.
--   pm_web needs no grant: GRANT EXECUTE ON SCHEMA::dbo (db/security/app-login.sql) covers the
--     procs, and the application never reads this table directly.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.BoardCard', N'U') IS NULL
BEGIN
    CREATE TABLE app.BoardCard (
        BoardCardId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BoardCard PRIMARY KEY,
        BoardId        INT NOT NULL CONSTRAINT FK_BoardCard_Board REFERENCES app.Board (BoardId),
        BoardColumnId  INT NOT NULL,
        BoardSprintId  INT NULL,
        RequirementId  INT NULL
            CONSTRAINT FK_BoardCard_Requirement REFERENCES app.Requirement (RequirementId),
        Title          NVARCHAR(300) NULL,
        Notes          NVARCHAR(MAX) NULL,
        AssigneeUserId INT NULL CONSTRAINT FK_BoardCard_Assignee REFERENCES auth.[User] (UserId),
        DueDate        DATE NULL,
        StoryPoints    INT NULL
            CONSTRAINT CK_BoardCard_StoryPoints CHECK (StoryPoints BETWEEN 0 AND 999),
        Color          VARCHAR(10) NULL
            CONSTRAINT CK_BoardCard_Color
                CHECK (Color IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray')),
        SortKey        BIGINT NOT NULL,
        IsDeleted      BIT NOT NULL CONSTRAINT DF_BoardCard_IsDeleted DEFAULT 0,
        DeletedAtUtc   DATETIME2 NULL,
        DeletedBy      INT NULL,
        CreatedAtUtc   DATETIME2 NOT NULL CONSTRAINT DF_BoardCard_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy      INT NOT NULL,
        UpdatedAtUtc   DATETIME2 NULL,
        UpdatedBy      INT NULL,
        RowVer         ROWVERSION,
        -- A card's column and sprint are its OWN board's.
        CONSTRAINT FK_BoardCard_Column FOREIGN KEY (BoardId, BoardColumnId)
            REFERENCES app.BoardColumn (BoardId, BoardColumnId),
        CONSTRAINT FK_BoardCard_Sprint FOREIGN KEY (BoardId, BoardSprintId)
            REFERENCES app.BoardSprint (BoardId, BoardSprintId),
        -- Table-level: a column CHECK may not name a second column (error 8141).
        CONSTRAINT CK_BoardCard_Content CHECK (Title IS NOT NULL OR RequirementId IS NOT NULL)
    );
END;
GO

-- The board read: a column's cards in rank order, and the WIP count behind usp_Board_AssertRoom.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BoardCard_Column'
                 AND object_id = OBJECT_ID(N'app.BoardCard'))
    CREATE INDEX IX_BoardCard_Column ON app.BoardCard (BoardId, IsDeleted, BoardColumnId, SortKey)
        INCLUDE (BoardSprintId, Title, RequirementId, AssigneeUserId, StoryPoints);
GO

-- The planning read: a sprint's cards, and the backlog (BoardSprintId NULL).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BoardCard_Sprint'
                 AND object_id = OBJECT_ID(N'app.BoardCard'))
    CREATE INDEX IX_BoardCard_Sprint ON app.BoardCard (BoardId, IsDeleted, BoardSprintId, SortKey)
        INCLUDE (BoardColumnId, StoryPoints);
GO

-- A requirement is packaged onto a board at most once. The Package proc checks it under the board
-- lock; this is the backstop that a race cannot get past.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_BoardCard_Requirement'
                 AND object_id = OBJECT_ID(N'app.BoardCard'))
    CREATE UNIQUE INDEX UQ_BoardCard_Requirement ON app.BoardCard (BoardId, RequirementId)
        WHERE RequirementId IS NOT NULL AND IsDeleted = 0;
GO

-- Cards have one total order per board. Two cards cannot share a rank, so a renumber that raced
-- another insert fails loudly (and the proc retries) instead of leaving an ambiguous board.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_BoardCard_SortKey'
                 AND object_id = OBJECT_ID(N'app.BoardCard'))
    CREATE UNIQUE INDEX UQ_BoardCard_SortKey ON app.BoardCard (BoardId, SortKey)
        WHERE IsDeleted = 0;
GO

-- The register's reverse lookup: which board holds this requirement (the "Add to board…" action
-- and the packaging redaction both ask).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BoardCard_Requirement'
                 AND object_id = OBJECT_ID(N'app.BoardCard'))
    CREATE INDEX IX_BoardCard_Requirement ON app.BoardCard (RequirementId, IsDeleted)
        INCLUDE (BoardId);
GO
