-- ufn_Requirement_DeleteSet — every row a "delete the children too" delete removes (ADR-0060 section 8).
-- The one definition, so usp_Requirement_DeleteImpact shows what usp_Requirement_Delete does.
-- Starts at the row and grows to a fixed point, because a doomed row brings its own sub-tree and
-- that sub-tree can leave further rows with nothing upstream:
--   a sub-requirement of a doomed row always goes, it cannot stay under a deleted parent;
--   a top-level row linked downstream goes only when every upstream link it has is to a doomed
--   row and no WBS item holds it. A link of any status counts, as does a WBS allocation, so the
--   walk deletes less. A sub-requirement under a surviving parent stays and only loses the link.
-- The set only grows and the project's rows bound it, so the walk ends with or without loops.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_Requirement_DeleteSet (@RequirementId INT)
RETURNS @Doomed TABLE (RequirementId INT PRIMARY KEY)
AS
BEGIN
    DECLARE @ProjectId INT =
        (SELECT ProjectId FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0);

    INSERT INTO @Doomed (RequirementId)
    SELECT @RequirementId WHERE @ProjectId IS NOT NULL;

    DECLARE @Added INT = @@ROWCOUNT;
    WHILE @Added > 0
    BEGIN
        INSERT INTO @Doomed (RequirementId)
        SELECT c.RequirementId
        FROM app.Requirement AS c
        WHERE c.ProjectId = @ProjectId AND c.IsDeleted = 0
          AND NOT EXISTS (SELECT 1 FROM @Doomed AS d WHERE d.RequirementId = c.RequirementId)
          AND (EXISTS (SELECT 1 FROM @Doomed AS d WHERE d.RequirementId = c.ParentRequirementId)
               OR (c.ParentRequirementId IS NULL
                   AND EXISTS (SELECT 1 FROM app.RequirementTrace AS t
                               JOIN @Doomed AS d ON d.RequirementId = t.ValidatesRequirementId
                               WHERE t.RequirementId = c.RequirementId)
                   AND NOT EXISTS (SELECT 1 FROM app.RequirementTrace AS t
                                   WHERE t.RequirementId = c.RequirementId
                                     AND NOT EXISTS (SELECT 1 FROM @Doomed AS d
                                                     WHERE d.RequirementId = t.ValidatesRequirementId))
                   AND NOT EXISTS (SELECT 1 FROM app.RequirementDeliverable AS a
                                   WHERE a.RequirementId = c.RequirementId)));
        SET @Added = @@ROWCOUNT;
    END;
    RETURN;
END;
GO
