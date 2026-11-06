-- usp_Requirement_AssertNoLinkLoop — refuse a link that would make a requirement sit downstream of
-- itself (ADR-0060): inherited coverage needs an end. Walks upstream from the row through every
-- link, whatever its status since a retired one can come back, and through parents, since a parent
-- counts its sub-requirements as downstream. Each row is visited once, so diamonds stay cheap.
-- Internal: it runs inside a requirement write proc's transaction, under the project lock, after
--   that proc's own access check. Named in EXEMPT in src/tests/proc-access-levels.test.ts.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_AssertNoLinkLoop
    @RequirementId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Links are only checked inside a requirement write', 1;

    DECLARE @Seen TABLE (RequirementId INT PRIMARY KEY);
    DECLARE @Frontier TABLE (RequirementId INT PRIMARY KEY);
    DECLARE @Next TABLE (RequirementId INT PRIMARY KEY);
    INSERT INTO @Frontier (RequirementId) VALUES (@RequirementId);

    WHILE EXISTS (SELECT 1 FROM @Frontier)
    BEGIN
        INSERT INTO @Next (RequirementId)
        SELECT e.RequirementId
        FROM (SELECT t.ValidatesRequirementId AS RequirementId
              FROM app.RequirementTrace AS t
              JOIN @Frontier AS f ON f.RequirementId = t.RequirementId
              UNION
              SELECT r.ParentRequirementId
              FROM app.Requirement AS r
              JOIN @Frontier AS f ON f.RequirementId = r.RequirementId
              WHERE r.ParentRequirementId IS NOT NULL) AS e
        WHERE NOT EXISTS (SELECT 1 FROM @Seen AS s WHERE s.RequirementId = e.RequirementId);

        IF EXISTS (SELECT 1 FROM @Next WHERE RequirementId = @RequirementId)
            THROW 50004, N'VALIDATION:This link would make a loop', 1;

        DELETE FROM @Frontier;
        INSERT INTO @Frontier (RequirementId) SELECT RequirementId FROM @Next;
        INSERT INTO @Seen (RequirementId) SELECT RequirementId FROM @Next;
        DELETE FROM @Next;
    END;
END;
GO
