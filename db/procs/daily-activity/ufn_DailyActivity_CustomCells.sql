-- ufn_DailyActivity_CustomCells — an activity's filled cells in the columns its project added
--   (ADR-0067), as JSON: [{"columnId":3,"date":"2026-12-01"},{"columnId":4,"optionId":9}, ...].
--   Cells of a deleted column are left out (they stay in the table, recoverable). NULL when none.
-- The caller has already checked access; this only reads.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_DailyActivity_CustomCells (@DailyActivityId INT)
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN (
        SELECT v.DailyActivityColumnId AS columnId,
               v.TextValue AS [text],
               CONVERT(CHAR(10), v.DateValue, 23) AS [date],
               v.LinkUrl AS link,
               v.OptionId AS optionId
        FROM app.DailyActivityCell v
        JOIN app.DailyActivityColumn c ON c.DailyActivityColumnId = v.DailyActivityColumnId AND c.IsDeleted = 0
        WHERE v.DailyActivityId = @DailyActivityId
        ORDER BY c.SortOrder, c.DailyActivityColumnId
        FOR JSON PATH);
END;
GO
