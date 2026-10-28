-- usp_BoardSprint_Start — move one sprint from 'planned' to 'active' and stamp StartedAtUtc;
-- returns the started sprint.
-- THIS IS THE SECOND THROWER OF 50007 (LIMIT_REACHED). The first is dbo.usp_Board_AssertRoom, which
--   throws it for a full column. Here it means "another sprint of this board is already running":
--   at most one sprint of a board is active (the plan's invariant), so a second start is refused
--   rather than queued. The client turns 50007 into messages.boards.sprintAlreadyActive, as against
--   messages.boards.columnFull for a card write — one code, two sentences, chosen by the intention
--   the user invoked. src/tests/board-sql-guardrails.test.ts lists both throwers explicitly: the
--   list was widened for this proc deliberately, so a third thrower still has to be argued for.
-- UQ_BoardSprint_Active (filtered unique index on BoardId WHERE State = 'active' AND IsDeleted = 0)
--   is the backstop, not the check. Under the board lock the check below always sees any committed
--   active sprint, so the index should never fire; if it ever did it would surface as 2601/INTERNAL,
--   which is why the honest answer is computed first. The plan's race matrix requires exactly this:
--   "10 starts across 2 planned sprints: exactly 1 active; the rest 50007, never 2601".
-- STARTING A SPRINT CHANGES WHAT EVERY COLUMN COUNTS. The board's scope rule (the inline function
--   in db/procs/board/, read by both the work-in-progress check and the board read) returns the
--   active sprint's cards while one is active, and every card not in a completed sprint otherwise,
--   so a
--   start can leave a column over its work-in-progress limit — or suddenly under it. That is
--   deliberate and is NOT checked here: refusing to start a sprint the team has planned because a
--   column would read "6 / 5" is the wrong trade (the plan, and ADR-0038). The column shows as over
--   and takes nothing new until it drains. This proc therefore never calls dbo.usp_Board_AssertRoom.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access (see usp_BoardSprint_Create), THEN guard this sprint's own RowVer. The lock
--   is what makes "one active sprint" hold: two starts serialise on the board row, so the second
--   sees the first's committed state.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess).
--   Starting a sprint is running the board, not administering it, so it is a Contributor verb like
--   moving a card — the same level usp_BoardSprint_Complete demands.
-- Entity app.BoardSprint. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardSprint_Start
    @BoardSprintId INT,
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

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

    -- Said separately from the "already running" case below: a sprint that is already active, or
    -- one that has been completed, is not a sprint anybody can start, and neither is the board's
    -- fault.
    IF @State <> 'planned'
        THROW 50004, N'VALIDATION:Only a planned sprint can be started', 1;

    IF EXISTS (SELECT 1 FROM app.BoardSprint
               WHERE BoardId = @BoardId AND [State] = 'active' AND IsDeleted = 0)
        THROW 50007, N'LIMIT_REACHED:Another sprint of this board is already active', 1;

    UPDATE app.BoardSprint SET
        [State]      = 'active',
        StartedAtUtc = SYSUTCDATETIME(),
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE BoardSprintId = @BoardSprintId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:The sprint was changed by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Start', N'app.BoardSprint', CAST(@BoardSprintId AS NVARCHAR(64)),
            (SELECT @State AS [State] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT [State], StartedAtUtc
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
