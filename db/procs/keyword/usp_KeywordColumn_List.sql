-- usp_KeywordColumn_List — the columns a project added to its keyword register, in their
--   order, each choice column with its live options (ADR-0067).
-- HasValues says whether the column holds any value, so the app offers a kind change only when it
--   would lose nothing (usp_KeywordColumn_SetKind refuses it otherwise).
-- Row-level access: the project must be accessible at Viewer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeywordColumn_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT c.KeywordColumnId, c.Name, c.Kind, c.SortOrder, CAST(c.RowVer AS BIGINT) AS RowVer,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM app.KeywordCell v
                                  WHERE v.KeywordColumnId = c.KeywordColumnId)
                     THEN 1 ELSE 0 END AS BIT) AS HasValues,
           (SELECT o.KeywordColumnOptionId AS id, o.Label AS label,
                   CAST(o.RowVer AS BIGINT) AS rowVer
            FROM app.KeywordColumnOption o
            WHERE o.KeywordColumnId = c.KeywordColumnId AND o.IsDeleted = 0
            ORDER BY o.SortOrder, o.KeywordColumnOptionId
            FOR JSON PATH) AS OptionsJson
    FROM app.KeywordColumn c
    WHERE c.ProjectId = @ProjectId AND c.IsDeleted = 0
    ORDER BY c.SortOrder, c.KeywordColumnId;
END;
GO
