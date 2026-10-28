-- usp_BoardSprint_Complete — move one sprint from 'active' to 'completed', stamp CompletedAtUtc, and
-- deal with the work that did not finish. One transaction: the state change and the card moves
-- commit together, so a completed sprint never exists with its unfinished cards still inside it.
-- Returns the counts, so the interface can say what happened ("12 done, 3 moved to the backlog")
-- rather than reporting a silent bulk move.
-- WHAT COUNTS AS UNFINISHED: a card of this sprint whose column is NOT a 'done' column
--   (app.BoardColumn.Category). Those move to @UnfinishedToSprintId, or to the backlog when it is
--   NULL. Cards already in a done column stay in the completed sprint, which is what makes the
--   sprint a record of what the team actually finished. The plan's race matrix states the invariant
--   this gives: "every card left in the completed sprint is in a done column".
--   A card keeps its COLUMN when it moves sprint — only its sprint changes. Column and sprint are
--   independent axes of the board (ADR-0038), and a card dragged back into the next sprint should
--   resume where it was left, not jump to the first column.
-- THERE IS NO REOPEN, and no undo of a completion (the plan). The dialog names the consequence
--   before this runs (messages.boards.completeSprintBody), and usp_BoardSprint_Update refuses a
--   completed sprint. This is a deliberate one-way door, not a missing feature: a reopen would have
--   to decide what happens to the cards that moved on, and the honest answer is a new sprint.
-- COMPLETING A SPRINT CHANGES WHAT EVERY COLUMN COUNTS. With no sprint active, the board's scope
--   rule (the inline function in db/procs/board/, which both the work-in-progress check and the
--   board read call) widens from "the active sprint's cards" to "every card not in a completed
--   sprint": the cards left behind in this sprint leave the count, and the ones moved to the
--   backlog or the next sprint enter it. A column can therefore end up over its
--   work-in-progress limit, and that is deliberate and NOT checked here — the plan is explicit that
--   completing a sprint may leave a column over, and that it then shows as over and takes nothing
--   new. So this proc never calls dbo.usp_Board_AssertRoom: refusing to close a finished sprint
--   because the backlog column would read "9 / 5" would strand the team.
-- @UnfinishedToSprintId must be a live PLANNED sprint of this board. It cannot be another active
--   sprint, because only one sprint of a board is ever active and that one is the sprint being
--   completed; it cannot be a completed sprint, which takes no new cards (the same rule
--   usp_BoardCard_Move enforces); and it cannot be this sprint, which is the one being closed.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access (see usp_BoardSprint_Create), THEN guard this sprint's own RowVer. The lock
--   is what makes the count honest: a card moved concurrently is serialised behind it, so the plan's
--   race row "10 completes of the active sprint: exactly 1; unfinished cards moved once; 1 audit
--   row" holds.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess).
--   Completing a sprint is running the board, the same level as starting one.
-- Entity app.BoardSprint. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardSprint_Complete
    @BoardSprintId         INT,
    @RowVer                BIGINT,
    @UnfinishedToSprintId  INT = NULL,
    @ActorUserId           INT
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

    IF @State <> 'active'
        THROW 50004, N'VALIDATION:Only the active sprint can be completed', 1;

    IF @UnfinishedToSprintId IS NOT NULL
    BEGIN
        IF @UnfinishedToSprintId = @BoardSprintId
            THROW 50004, N'VALIDATION:The unfinished cards need a different sprint to move to', 1;
        IF NOT EXISTS (SELECT 1 FROM app.BoardSprint
                       WHERE BoardSprintId = @UnfinishedToSprintId AND BoardId = @BoardId
                         AND IsDeleted = 0)
            THROW 50004, N'VALIDATION:That sprint is not on this board', 1;
        IF NOT EXISTS (SELECT 1 FROM app.BoardSprint
                       WHERE BoardSprintId = @UnfinishedToSprintId AND [State] = 'planned')
            THROW 50004, N'VALIDATION:Unfinished cards move to a planned sprint or to the backlog', 1;
    END;

    -- Counted before the move, under the lock, so both numbers describe the same moment.
    DECLARE @Kept INT =
        (SELECT COUNT(*)
         FROM app.BoardCard c
         JOIN app.BoardColumn col ON col.BoardColumnId = c.BoardColumnId
         WHERE c.BoardId = @BoardId AND c.BoardSprintId = @BoardSprintId AND c.IsDeleted = 0
           AND col.Category = 'done');

    UPDATE c SET
        BoardSprintId = @UnfinishedToSprintId,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    FROM app.BoardCard c
    JOIN app.BoardColumn col ON col.BoardColumnId = c.BoardColumnId
    WHERE c.BoardId = @BoardId AND c.BoardSprintId = @BoardSprintId AND c.IsDeleted = 0
      AND col.Category <> 'done';
    DECLARE @Moved INT = @@ROWCOUNT;

    UPDATE app.BoardSprint SET
        [State]        = 'completed',
        CompletedAtUtc = SYSUTCDATETIME(),
        UpdatedAtUtc   = SYSUTCDATETIME(),
        UpdatedBy      = @ActorUserId
    WHERE BoardSprintId = @BoardSprintId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:The sprint was changed by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Complete', N'app.BoardSprint', CAST(@BoardSprintId AS NVARCHAR(64)),
            (SELECT @State AS [State] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Moved AS MovedCards, @Kept AS KeptCards,
                    @UnfinishedToSprintId AS MovedToSprintId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @Moved AS MovedCards,
           @Kept AS KeptCards,
           @UnfinishedToSprintId AS MovedToSprintId;
END;
GO
