-- ufn_Board_CardsInScope — the ONE definition of "the cards this board is currently working"
-- (ADR-0038), as an inline table-valued function so the WIP check and the board read agree by
-- construction rather than by two predicates kept in step by hand.
--   * While a sprint is active: that sprint's cards.
--   * Otherwise: every card not in a completed sprint, the backlog included.
-- That is what makes the plan's invariant true — a column's "3 / 5" always counts exactly the
-- cards drawn under it, because dbo.usp_Board_AssertRoom and dbo.usp_Board_GetBoard read this
-- same function.
-- A card whose sprint was soft-deleted keeps the sprint's real state here (the join does not
-- filter IsDeleted), so deleting a planned sprint never hides its cards; deleting a completed one
-- never resurrects them. Moving them to the backlog is the sprint Delete proc's job.
-- Lives in db/procs/board/ and is named ufn_*, so both appliers create it before this folder's
-- procs. Procs only; the application never calls it.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_Board_CardsInScope
(
    @BoardId INT
)
RETURNS TABLE
AS
RETURN
    SELECT c.BoardCardId,
           c.BoardColumnId,
           c.BoardSprintId,
           c.StoryPoints
    FROM app.BoardCard c
    LEFT JOIN app.BoardSprint s ON s.BoardSprintId = c.BoardSprintId
    CROSS APPLY (
        SELECT ActiveSprintId = (SELECT TOP (1) BoardSprintId
                                 FROM app.BoardSprint
                                 WHERE BoardId = @BoardId AND [State] = 'active' AND IsDeleted = 0)
    ) a
    WHERE c.BoardId = @BoardId
      AND c.IsDeleted = 0
      AND (
            (a.ActiveSprintId IS NOT NULL AND c.BoardSprintId = a.ActiveSprintId)
         OR (a.ActiveSprintId IS NULL
             AND (c.BoardSprintId IS NULL OR ISNULL(s.[State], 'planned') <> 'completed'))
          );
GO
