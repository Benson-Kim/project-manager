-- usp_RequirementColumn_List — the columns a project added to its requirement register, in their
--   order, each choice column with its live options (ADR-0067).
-- HasValues says whether the column holds any value, so the app offers a kind change only when it
--   would lose nothing (usp_RequirementColumn_SetKind refuses it otherwise).
-- Row-level access: the project must be accessible at Viewer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementColumn_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT c.RequirementColumnId, c.Name, c.Kind, c.SortOrder, CAST(c.RowVer AS BIGINT) AS RowVer,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM app.RequirementCell v
                                  WHERE v.RequirementColumnId = c.RequirementColumnId)
                     THEN 1 ELSE 0 END AS BIT) AS HasValues,
           (SELECT o.RequirementColumnOptionId AS id, o.Label AS label,
                   CAST(o.RowVer AS BIGINT) AS rowVer
            FROM app.RequirementColumnOption o
            WHERE o.RequirementColumnId = c.RequirementColumnId AND o.IsDeleted = 0
            ORDER BY o.SortOrder, o.RequirementColumnOptionId
            FOR JSON PATH) AS OptionsJson
    FROM app.RequirementColumn c
    WHERE c.ProjectId = @ProjectId AND c.IsDeleted = 0
    ORDER BY c.SortOrder, c.RequirementColumnId;
END;
GO
