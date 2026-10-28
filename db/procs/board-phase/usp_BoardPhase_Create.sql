-- usp_BoardPhase_Create — add one phase to a board, at the end (highest SortOrder + 1), with an
-- in-transaction audit row; returns the new phase.
-- A phase is an optional grouping of sprints with its own dates (ADR-0038). Sprints without a phase
--   are allowed, so nothing here creates a default phase.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access. A board's ProjectId can change (dbo.usp_Board_SetProject), so a check made
--   before the lock could be against the project the board has just left. This proc lives outside
--   db/procs/board/, so it reaches the board rule through dbo.usp_Board_AssertAccess (a proc call
--   resolves at run time, whichever order the applier created the folders), exactly as
--   usp_BoardColumn_Create does.
-- Row-level access: Contributor on the board with 'boards:create' (dbo.usp_Board_AssertAccess,
--   NOT_FOUND 50001, FORBIDDEN_ROW 50003).
-- Both dates are optional, and either one alone is allowed: a phase can be dated once its sprints
--   are planned. CK_BoardPhase_Dates holds the ordering in the database; this check is here so the
--   caller gets VALIDATION 50004 rather than a constraint error mapped to INTERNAL.
-- A phase name is NOT unique per board: no index constrains it (app.BoardPhase has no filtered
--   unique index on Name, unlike app.BoardColumn), so this proc does not invent a rule the database
--   does not hold. Two phases may legitimately share a name across different date ranges.
-- Entity app.BoardPhase. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardPhase_Create
    @BoardId     INT,
    @Name        NVARCHAR(100),
    @StartDate   DATE = NULL,
    @EndDate     DATE = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Name = LTRIM(RTRIM(@Name));
    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 100
        THROW 50004, N'VALIDATION:A phase needs a name of up to 100 characters', 1;
    IF @StartDate IS NOT NULL AND @EndDate IS NOT NULL AND @EndDate < @StartDate
        THROW 50004, N'VALIDATION:A phase ends on or after the day it starts', 1;

    BEGIN TRAN;

    DECLARE @BoardExists INT;
    SELECT @BoardExists = BoardId
    FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @BoardExists IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:create';

    DECLARE @SortOrder INT =
        ISNULL((SELECT MAX(SortOrder) FROM app.BoardPhase
                WHERE BoardId = @BoardId AND IsDeleted = 0), 0) + 1;

    INSERT INTO app.BoardPhase (BoardId, [Name], StartDate, EndDate, SortOrder, CreatedBy)
    VALUES (@BoardId, @Name, @StartDate, @EndDate, @SortOrder, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.BoardPhase', CAST(@Id AS NVARCHAR(64)),
            (SELECT BoardPhaseId, BoardId, [Name], StartDate, EndDate, SortOrder
             FROM app.BoardPhase WHERE BoardPhaseId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT BoardPhaseId,
           BoardId,
           [Name],
           StartDate,
           EndDate,
           SortOrder,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BoardPhase
    WHERE BoardPhaseId = @Id;
END;
GO
