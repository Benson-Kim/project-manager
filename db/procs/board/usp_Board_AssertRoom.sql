-- usp_Board_AssertRoom — the work-in-progress check (ADR-0038): THROW 50007 LIMIT_REACHED when one
-- more card would take a column past its WIP limit. This is the thrower 50007 was registered for.
-- An internal helper, like dbo.usp_Requirement_ReplaceAllocations:
--   * it asserts NO access of its own — every caller has already locked the board row and called
--     dbo.usp_Board_AssertAccess, which is the check that decides;
--   * so it refuses to run outside a transaction (@@TRANCOUNT = 0), which is what would happen if
--     a caller forgot the lock: the count it reads would be stale before it returned;
--   * it resolves the column, the limit and the WIP scope FROM THE ROWS, never from the caller.
--   It is EXEMPT in src/tests/proc-access-levels.test.ts for that reason, and a guardrail fails the
--   build if any TypeScript file names it: the application must never call it directly.
-- @ExcludeCardId: the card being moved, so a move WITHIN one column does not count itself and
--   refuse a reorder that frees no slot.
-- @Adding: how many cards are about to land. 1 (the default) is the single create or move. A
--   column delete reflows several at once and asks for room for all of them in one call, rather
--   than calling this once per card and letting the last one fail halfway through.
-- @Adding = 0 means "just tell me the count, never throw": it is how a caller sizes a reflow before
--   asking the target for room. It must not throw, because a column can legitimately already be
--   over its limit (a sprint started, or the limit was lowered) and that must not block emptying it.
-- @InScope OUTPUT: the count this proc measured, so a caller that needs the number does not
--   recompute the scope rule itself. The scope lives here and nowhere else.
-- WIP SCOPE — which cards count is dbo.ufn_Board_CardsInScope, the same function the board read
-- uses, so a column's "3 / 5" always counts exactly the cards drawn under it. Starting or
-- completing a sprint, or lowering a limit, may leave a column over its limit; it then shows as
-- over and takes nothing new, which is the honest outcome — the alternative is refusing to start a
-- sprint the team has planned.
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_AssertRoom
    @BoardId       INT,
    @BoardColumnId INT,
    @ExcludeCardId INT = NULL,
    @Adding        INT = 1,
    @InScope       INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SET @InScope = NULL;

    -- No transaction means no board lock, so any count read here could be overtaken before the
    -- caller writes. Fail loudly rather than enforce the limit only most of the time.
    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:usp_Board_AssertRoom must run inside the caller''s transaction', 1;

    DECLARE @WipLimit INT;
    SELECT @WipLimit = WipLimit
    FROM app.BoardColumn
    WHERE BoardColumnId = @BoardColumnId AND BoardId = @BoardId AND IsDeleted = 0;
    -- @@ROWCOUNT, not @WipLimit IS NULL: an unlimited column and a column that is not this board's
    -- both leave the variable NULL, and only one of them is allowed to pass.
    IF @@ROWCOUNT = 0
        THROW 50004, N'VALIDATION:That column is not on this board', 1;

    -- Counted before the limit is consulted, because a caller sizing a reflow (@Adding = 0) needs
    -- the number even from a column that has no limit at all.
    SELECT @InScope = COUNT(*)
    FROM dbo.ufn_Board_CardsInScope(@BoardId) c
    WHERE c.BoardColumnId = @BoardColumnId
      AND (@ExcludeCardId IS NULL OR c.BoardCardId <> @ExcludeCardId);

    IF @Adding > 0 AND @WipLimit IS NOT NULL AND @InScope + @Adding > @WipLimit
        THROW 50007, N'LIMIT_REACHED:That column is at its work-in-progress limit', 1;
END;
GO
