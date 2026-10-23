-- usp_BoardSprint_Delete — soft-delete one PLANNED sprint. Its cards are not deleted with it: they
-- go to the backlog (BoardSprintId = NULL), keeping their column. Returns how many moved, so the
-- interface can name the consequence rather than silently unscheduling work.
-- PLANNED SPRINTS ONLY (the plan, and ADR-0038):
--   * an ACTIVE sprint is the board's current work — closing it is dbo.usp_BoardSprint_Complete,
--     which decides where the unfinished cards go. Deleting it instead would silently discard that
--     decision and leave the board with no active sprint and no record of why.
--   * a COMPLETED sprint is the record of what the team did. There is no reopen and no undo of a
--     completion, so there is no delete either; keeping it is the point of it.
--   Both answer VALIDATION 50004.
-- Write order (ADR-0038, pinned by src/tests/board-sql-guardrails.test.ts): lock the board row,
--   THEN assert access (see usp_BoardSprint_Create).
-- Row-level access: Manager on the board with 'boards:delete' (dbo.usp_Board_AssertAccess),
--   CONFLICT 50002 on a stale RowVer.
-- Sending the cards to the backlog is what keeps the plan's race row true — "delete a sprint while
--   a card is added to it: no live card in a deleted sprint" — because both writes happen under the
--   one board lock, so a concurrent card write either lands before this proc reads (and is moved
--   with the rest) or waits and then sees a sprint that is gone.
--   The board's scope rule (the inline function in db/procs/board/) deliberately does not filter
--   IsDeleted on the sprint join, so these cards would have stayed visible either way; moving them
--   is what makes the board honest about where they now are.
-- No work-in-progress check: the cards keep their columns, so no column's count changes. A planned
--   sprint is not in scope while another sprint is active, and if none is, its cards were already
--   counted — either way dbo.usp_Board_AssertRoom has nothing to decide, which is why it is not
--   called here.
-- Entity app.BoardSprint. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardSprint_Delete
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

    DECLARE @Lock INT;
    SELECT @Lock = BoardId FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'boards:delete';

    DECLARE @State VARCHAR(10);
    SELECT @State = [State] FROM app.BoardSprint
    WHERE BoardSprintId = @BoardSprintId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @State IS NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardSprint WHERE BoardSprintId = @BoardSprintId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Sprint not found', 1;
        THROW 50002, N'CONFLICT:The sprint was changed by someone else', 1;
    END;

    IF @State = 'active'
        THROW 50004, N'VALIDATION:Complete the active sprint instead of deleting it', 1;
    IF @State = 'completed'
        THROW 50004, N'VALIDATION:A completed sprint is kept as a record and cannot be deleted', 1;

    DECLARE @Cards INT =
        (SELECT COUNT(*) FROM app.BoardCard
         WHERE BoardId = @BoardId AND BoardSprintId = @BoardSprintId AND IsDeleted = 0);

    IF @Cards > 0
        UPDATE app.BoardCard SET
            BoardSprintId = NULL,
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy = @ActorUserId
        WHERE BoardId = @BoardId AND BoardSprintId = @BoardSprintId AND IsDeleted = 0;

    UPDATE app.BoardSprint SET
        IsDeleted = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy = @ActorUserId
    WHERE BoardSprintId = @BoardSprintId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.BoardSprint', CAST(@BoardSprintId AS NVARCHAR(64)),
            (SELECT @BoardId AS BoardId, @State AS [State], @Cards AS CardCount
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @Cards AS CardsToBacklog
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @Cards AS CardsToBacklog;
END;
GO
