-- usp_DailyActivityColumn_List — the columns a project added to its activity register, in their
--   order, each choice column with its live options (ADR-0067).
-- HasValues says whether the column holds any value, so the app offers a kind change only when it
--   would lose nothing (usp_DailyActivityColumn_SetKind refuses it otherwise).
-- Row-level access: the project must be accessible at Viewer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivityColumn_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT c.DailyActivityColumnId, c.Name, c.Kind, c.SortOrder, CAST(c.RowVer AS BIGINT) AS RowVer,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM app.DailyActivityCell v
                                  WHERE v.DailyActivityColumnId = c.DailyActivityColumnId)
                     THEN 1 ELSE 0 END AS BIT) AS HasValues,
           (SELECT o.DailyActivityColumnOptionId AS id, o.Label AS label,
                   CAST(o.RowVer AS BIGINT) AS rowVer
            FROM app.DailyActivityColumnOption o
            WHERE o.DailyActivityColumnId = c.DailyActivityColumnId AND o.IsDeleted = 0
            ORDER BY o.SortOrder, o.DailyActivityColumnOptionId
            FOR JSON PATH) AS OptionsJson
    FROM app.DailyActivityColumn c
    WHERE c.ProjectId = @ProjectId AND c.IsDeleted = 0
    ORDER BY c.SortOrder, c.DailyActivityColumnId;
END;
GO
