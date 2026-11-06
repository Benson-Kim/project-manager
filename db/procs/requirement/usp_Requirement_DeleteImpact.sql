-- usp_Requirement_DeleteImpact — what deleting a requirement and its children would do, read before
-- the dialog asks (ADR-0060 section 8). Fate 'Deleted' is ufn_Requirement_DeleteSet, the row itself
-- included; 'Unlinked' is a row that stays and only loses a link to one of them.
-- Access: the same as the delete, Manager + requirements:delete, on the project the row belongs to.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_DeleteImpact
    @RequirementId INT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'requirements:delete', @AllowProjectless = 0;

    DECLARE @Doomed TABLE (RequirementId INT PRIMARY KEY);
    INSERT INTO @Doomed (RequirementId)
    SELECT RequirementId FROM dbo.ufn_Requirement_DeleteSet(@RequirementId);

    SELECT f.RequirementId, r.RequirementType, p.Ref, f.Fate
    FROM (SELECT RequirementId, N'Deleted' AS Fate FROM @Doomed
          UNION ALL
          SELECT DISTINCT t.RequirementId, N'Unlinked'
          FROM app.RequirementTrace AS t
          JOIN @Doomed AS d ON d.RequirementId = t.ValidatesRequirementId
          WHERE NOT EXISTS (SELECT 1 FROM @Doomed AS k WHERE k.RequirementId = t.RequirementId)) AS f
    JOIN app.Requirement AS r ON r.RequirementId = f.RequirementId AND r.IsDeleted = 0
    CROSS APPLY dbo.ufn_Requirement_AncestorPath(f.RequirementId) AS p
    ORDER BY f.Fate, p.SortPath;
END;
GO
