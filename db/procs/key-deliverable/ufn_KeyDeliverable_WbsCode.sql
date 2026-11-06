-- ufn_KeyDeliverable_WbsCode — each live item's number in its project's breakdown (ADR-0027).
-- WbsCode reads "1.2.3", each part the item's place among its live siblings. WbsKey pads the parts
-- so the text sorts in breakdown order. @ProjectId NULL numbers every project. Lvl < 50 bounds the
-- walk well past the 10 levels usp_KeyDeliverable_AssertPlacement allows. Procs only; the
-- application never calls it.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_KeyDeliverable_WbsCode
(
    @ProjectId INT
)
RETURNS TABLE
AS
RETURN
    WITH placed AS (
        SELECT k.KeyDeliverableId, k.ParentKeyDeliverableId,
               ROW_NUMBER() OVER (PARTITION BY k.ProjectId, k.ParentKeyDeliverableId
                                  ORDER BY k.SortOrder, k.KeyDeliverableId) AS Position
        FROM app.KeyDeliverable AS k
        WHERE k.IsDeleted = 0 AND (@ProjectId IS NULL OR k.ProjectId = @ProjectId)
    ),
    wbs AS (
        SELECT p.KeyDeliverableId,
               CAST(p.Position AS NVARCHAR(400)) AS WbsCode,
               CAST(RIGHT(N'0000' + CAST(p.Position AS NVARCHAR(10)), 5) AS NVARCHAR(400)) AS WbsKey,
               1 AS Lvl
        FROM placed AS p
        WHERE p.ParentKeyDeliverableId IS NULL
        UNION ALL
        SELECT c.KeyDeliverableId,
               CAST(w.WbsCode + N'.' + CAST(c.Position AS NVARCHAR(10)) AS NVARCHAR(400)),
               CAST(w.WbsKey + N'.' + RIGHT(N'0000' + CAST(c.Position AS NVARCHAR(10)), 5) AS NVARCHAR(400)),
               w.Lvl + 1
        FROM wbs AS w
        JOIN placed AS c ON c.ParentKeyDeliverableId = w.KeyDeliverableId
        WHERE w.Lvl < 50
    )
    SELECT KeyDeliverableId, WbsCode, WbsKey
    FROM wbs;
GO
