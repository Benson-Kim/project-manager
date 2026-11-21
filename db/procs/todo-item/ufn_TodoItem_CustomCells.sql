-- ufn_TodoItem_CustomCells — a to-do's filled cells in the columns its project added
--   (ADR-0067), as JSON: [{"columnId":3,"date":"2026-12-01"},{"columnId":4,"optionId":9}, ...].
--   Cells of a deleted column are left out (they stay in the table, recoverable). NULL when none.
-- The caller has already checked access; this only reads.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_TodoItem_CustomCells (@TodoItemId INT)
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN (
        SELECT v.TodoItemColumnId AS columnId,
               v.TextValue AS [text],
               CONVERT(CHAR(10), v.DateValue, 23) AS [date],
               v.LinkUrl AS link,
               v.OptionId AS optionId
        FROM app.TodoItemCell v
        JOIN app.TodoItemColumn c ON c.TodoItemColumnId = v.TodoItemColumnId AND c.IsDeleted = 0
        WHERE v.TodoItemId = @TodoItemId
        ORDER BY c.SortOrder, c.TodoItemColumnId
        FOR JSON PATH);
END;
GO
