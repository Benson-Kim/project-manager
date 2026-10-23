-- usp_BoardSprint_Update — edit one sprint's name, goal, dates and phase; returns the updated
-- sprint.
-- THE STATE IS NOT A FIELD HERE. A sprint's lifecycle moves planned -> active -> completed through
--   its own intentions, dbo.usp_BoardSprint_Start and dbo.usp_BoardSprint_Complete, because each
--   transition carries work with it: starting one changes which cards every column counts (the
--   board's scope rule, in db/procs/board/), and completing one moves the unfinished cards. @State,
--   @StartedAtUtc and @CompletedAtUtc are therefore absent from this parameter list, and a
--   guardrail fails the build if any of them appears — an edit must never be able to start or
--   finish a sprint as a side effect of renaming it.
-- A COMPLETED SPRINT IS READ-ONLY (the plan, and ADR-0038): it is the record of what a team
--   actually did, and there is no reopen. Editing one answers VALIDATION 50004. A planned or
--   active sprint edits freely.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access (see usp_BoardSprint_Create), THEN guard this sprint's own RowVer.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess).
--   CONFLICT 50002 on a stale RowVer; a deleted sprint answers NOT_FOUND 50001 rather than CONFLICT.
-- A sprint never changes board: @BoardId is not a parameter and the board is read from the row.
-- Entity app.BoardSprint. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardSprint_Update
    @BoardSprintId INT,
    @RowVer        BIGINT,
    @Name          NVARCHAR(100),
    @StartDate     DATE,
    @EndDate       DATE,
    @Goal          NVARCHAR(1000) = NULL,
    @BoardPhaseId  INT = NULL,
    @ActorUserId   INT
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

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardSprint
    WHERE BoardSprintId = @BoardSprintId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Sprint not found', 1;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT, @State VARCHAR(10);
    SELECT @CurrentVer = CAST(sp.RowVer AS BIGINT), @State = sp.[State]
    FROM app.Board b WITH (UPDLOCK, HOLDLOCK)
    JOIN app.BoardSprint sp ON sp.BoardId = b.BoardId
    WHERE b.BoardId = @BoardId AND b.IsDeleted = 0
      AND sp.BoardSprintId = @BoardSprintId AND sp.IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Sprint not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:The sprint was changed by someone else', 1;

    IF @State = 'completed'
        THROW 50004, N'VALIDATION:A completed sprint cannot be changed', 1;

    IF @BoardPhaseId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.BoardPhase
                       WHERE BoardPhaseId = @BoardPhaseId AND BoardId = @BoardId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:That phase is not on this board', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT BoardSprintId, BoardId, BoardPhaseId, [Name], Goal, StartDate, EndDate, [State]
         FROM app.BoardSprint WHERE BoardSprintId = @BoardSprintId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.BoardSprint SET
        BoardPhaseId = @BoardPhaseId,
        [Name]       = @Name,
        Goal         = @Goal,
        StartDate    = @StartDate,
        EndDate      = @EndDate,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE BoardSprintId = @BoardSprintId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:The sprint was changed by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.BoardSprint', CAST(@BoardSprintId AS NVARCHAR(64)), @Before,
            (SELECT BoardSprintId, BoardId, BoardPhaseId, [Name], Goal, StartDate, EndDate, [State]
             FROM app.BoardSprint WHERE BoardSprintId = @BoardSprintId
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
    WHERE BoardSprintId = @BoardSprintId;
END;
GO
