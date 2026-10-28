-- usp_BoardSprint_Create — add one sprint to a board, optionally inside a phase; returns the new
-- sprint. A new sprint is always 'planned' with no stamps: starting it is its own intention
-- (usp_BoardSprint_Start), so nothing can create a sprint that is already running.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access. This proc lives outside db/procs/board/, so it reaches the board rule
--   through dbo.usp_Board_AssertAccess, exactly as usp_BoardColumn_Create does.
-- Row-level access: Contributor on the board with 'boards:create' (dbo.usp_Board_AssertAccess,
--   NOT_FOUND 50001, FORBIDDEN_ROW 50003).
-- @BoardPhaseId must be a live phase of THIS board. The composite foreign key
--   FK_BoardSprint_Phase (BoardId, BoardPhaseId) already makes another board's phase impossible;
--   this check is here so a wrong id answers VALIDATION 50004 instead of a foreign-key error
--   mapped to INTERNAL. A sprint with no phase is normal and is what NULL means.
-- Both dates are required (app.BoardSprint.StartDate/EndDate are NOT NULL) and CK_BoardSprint_Dates
--   holds EndDate >= StartDate in the database; the proc checks it first so the caller gets 50004.
-- Entity app.BoardSprint. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardSprint_Create
    @BoardId      INT,
    @Name         NVARCHAR(100),
    @StartDate    DATE,
    @EndDate      DATE,
    @Goal         NVARCHAR(1000) = NULL,
    @BoardPhaseId INT = NULL,
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Name = LTRIM(RTRIM(@Name));
    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 100
        THROW 50004, N'VALIDATION:A sprint needs a name of up to 100 characters', 1;
    IF @Goal IS NOT NULL AND LEN(@Goal) > 1000
        THROW 50004, N'VALIDATION:A sprint goal is up to 1000 characters', 1;
    IF @StartDate IS NULL OR @EndDate IS NULL
        THROW 50004, N'VALIDATION:A sprint needs a start and an end date', 1;
    IF @EndDate < @StartDate
        THROW 50004, N'VALIDATION:A sprint ends on or after the day it starts', 1;

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

    IF @BoardPhaseId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.BoardPhase
                       WHERE BoardPhaseId = @BoardPhaseId AND BoardId = @BoardId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:That phase is not on this board', 1;

    INSERT INTO app.BoardSprint (BoardId, BoardPhaseId, [Name], Goal, StartDate, EndDate, [State], CreatedBy)
    VALUES (@BoardId, @BoardPhaseId, @Name, @Goal, @StartDate, @EndDate, 'planned', @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.BoardSprint', CAST(@Id AS NVARCHAR(64)),
            (SELECT BoardSprintId, BoardId, BoardPhaseId, [Name], Goal, StartDate, EndDate, [State]
             FROM app.BoardSprint WHERE BoardSprintId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT BoardSprintId,
           BoardId,
           BoardPhaseId,
           [Name],
           Goal,
           StartDate,
           EndDate,
           [State],
           StartedAtUtc,
           CompletedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BoardSprint
    WHERE BoardSprintId = @Id;
END;
GO
