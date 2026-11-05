-- usp_Decision_ReplaceImpactedAreas — set the areas one decision affects (ADR-0055).
-- Internal: it runs inside a decision write proc's transaction, after that proc's own access
--   check, so it asserts no access of its own and refuses to run outside a transaction. Named in
--   EXEMPT in src/tests/proc-access-levels.test.ts; a guardrail fails if any TS file calls it.
-- The project comes from the row, never from the caller. Each label is checked against the live
--   decision.impacted-area list one at a time, which also rewrites it to the option's spelling.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Decision_ReplaceImpactedAreas
    @DecisionId  INT,
    @Labels      NVARCHAR(MAX),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Impacted areas are only replaced inside a decision write', 1;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.Decision WHERE DecisionId = @DecisionId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Decision not found', 1;

    IF @Labels IS NULL OR ISJSON(@Labels) <> 1 OR LEFT(LTRIM(@Labels), 1) <> N'['
        THROW 50004, N'VALIDATION:Impacted areas must be a JSON array', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Labels)
               WHERE [type] <> 1 OR NULLIF(TRIM([value]), N'') IS NULL)
        THROW 50004, N'VALIDATION:Each impacted area must be a non-empty name', 1;

    IF (SELECT COUNT(*) FROM OPENJSON(@Labels)) > 50
        THROW 50004, N'VALIDATION:A decision can affect at most 50 areas', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Labels)
               GROUP BY TRIM([value]) HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:An impacted area is listed twice', 1;

    DECLARE @Wanted TABLE (Ordinal INT IDENTITY(1, 1) PRIMARY KEY, Label NVARCHAR(50));
    INSERT INTO @Wanted (Label)
    SELECT TRIM([value]) FROM OPENJSON(@Labels);

    -- One AssertLabel per area: it is the single place that decides what a label bound to a
    -- managed list may be, and it hands back the option's own spelling (ADR-0022). An area the
    -- decision already carries passes as @CurrentLabel, so a retired option it still uses survives
    -- a save of another field.
    DECLARE @Ordinal INT = 1, @Last INT = (SELECT ISNULL(MAX(Ordinal), 0) FROM @Wanted);
    DECLARE @Label NVARCHAR(255), @Current NVARCHAR(255);
    WHILE @Ordinal <= @Last
    BEGIN
        SET @Label = (SELECT Label FROM @Wanted WHERE Ordinal = @Ordinal);
        SET @Current = (SELECT TOP (1) a.Label
                        FROM app.DecisionImpactedArea AS a
                        WHERE a.DecisionId = @DecisionId AND a.Label = @Label);
        EXEC dbo.usp_LookupList_AssertLabel
             @ListKey = N'decision.impacted-area', @Label = @Label OUTPUT,
             @CurrentLabel = @Current;
        UPDATE @Wanted SET Label = @Label WHERE Ordinal = @Ordinal;
        SET @Ordinal = @Ordinal + 1;
    END

    IF EXISTS (SELECT 1 FROM @Wanted GROUP BY Label HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:An impacted area is listed twice', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT a.Label AS label
         FROM app.DecisionImpactedArea AS a
         WHERE a.DecisionId = @DecisionId
         ORDER BY a.Label
         FOR JSON PATH, INCLUDE_NULL_VALUES);

    DELETE a FROM app.DecisionImpactedArea AS a
    WHERE a.DecisionId = @DecisionId
      AND a.Label NOT IN (SELECT Label FROM @Wanted);
    DECLARE @Changed INT = @@ROWCOUNT;

    INSERT INTO app.DecisionImpactedArea (DecisionId, ProjectId, Label, CreatedBy)
    SELECT @DecisionId, @RowProjectId, w.Label, @ActorUserId
    FROM @Wanted AS w
    WHERE NOT EXISTS (SELECT 1 FROM app.DecisionImpactedArea AS a
                      WHERE a.DecisionId = @DecisionId AND a.Label = w.Label);
    SET @Changed = @Changed + @@ROWCOUNT;

    IF @Changed > 0
        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'SetImpactedAreas', N'app.Decision',
                CAST(@DecisionId AS NVARCHAR(64)), @Before,
                (SELECT a.Label AS label
                 FROM app.DecisionImpactedArea AS a
                 WHERE a.DecisionId = @DecisionId
                 ORDER BY a.Label
                 FOR JSON PATH, INCLUDE_NULL_VALUES));
END;
GO
