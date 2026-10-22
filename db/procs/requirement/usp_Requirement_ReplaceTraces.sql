-- usp_Requirement_ReplaceTraces — set the needs one requirement validates (ADR-0037).
-- Internal: it runs inside a requirement write proc's transaction, after that proc's own access
--   check, so it asserts no access of its own and refuses to run outside a transaction. Named in
--   EXEMPT in src/tests/proc-access-levels.test.ts; a guardrail fails if any TS file calls it.
-- The project and the side come from the row, never from the caller. A missing id and an id in
--   another project answer alike, so a list cannot probe for ids.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_ReplaceTraces
    @RequirementId INT,
    @Ids           NVARCHAR(MAX),
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Links are only replaced inside a requirement write', 1;

    DECLARE @RowProjectId INT, @RowType VARCHAR(3);
    SELECT @RowProjectId = ProjectId, @RowType = RequirementType
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    IF @Ids IS NULL OR ISJSON(@Ids) <> 1 OR LEFT(LTRIM(@Ids), 1) <> N'['
        THROW 50004, N'VALIDATION:Validated requirements must be a JSON array', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Ids)
               WHERE [type] <> 2 OR TRY_CAST([value] AS INT) IS NULL OR TRY_CAST([value] AS INT) < 1)
        THROW 50004, N'VALIDATION:Each validated requirement must be a positive number', 1;

    IF (SELECT COUNT(*) FROM OPENJSON(@Ids)) > 200
        THROW 50004, N'VALIDATION:A requirement can validate at most 200 requirements', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Ids)
               GROUP BY TRY_CAST([value] AS INT) HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:A validated requirement is listed twice', 1;

    DECLARE @Wanted TABLE (RequirementId INT PRIMARY KEY);
    INSERT INTO @Wanted (RequirementId)
    SELECT TRY_CAST([value] AS INT) FROM OPENJSON(@Ids);

    IF EXISTS (SELECT 1 FROM @Wanted) AND @RowType NOT IN ('FR', 'NFR', 'TR')
        THROW 50004, N'VALIDATION:This kind of requirement cannot validate another', 1;

    IF EXISTS (SELECT 1 FROM @Wanted WHERE RequirementId = @RequirementId)
        THROW 50004, N'VALIDATION:A requirement cannot validate itself', 1;

    IF EXISTS (SELECT 1 FROM @Wanted AS w
               WHERE NOT EXISTS (SELECT 1 FROM app.Requirement AS t
                                 WHERE t.RequirementId = w.RequirementId
                                   AND t.ProjectId = @RowProjectId
                                   AND t.IsDeleted = 0))
        THROW 50004, N'VALIDATION:A requirement to validate was not found', 1;

    IF EXISTS (SELECT 1 FROM @Wanted AS w
               JOIN app.Requirement AS t ON t.RequirementId = w.RequirementId
               WHERE t.RequirementType NOT IN ('BR', 'SR'))
        THROW 50004, N'VALIDATION:Only a business or stakeholder requirement is validated', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT t.ValidatesRequirementId AS id
         FROM app.RequirementTrace AS t
         WHERE t.RequirementId = @RequirementId
         ORDER BY t.ValidatesRequirementId
         FOR JSON PATH, INCLUDE_NULL_VALUES);

    DELETE t FROM app.RequirementTrace AS t
    WHERE t.RequirementId = @RequirementId
      AND t.ValidatesRequirementId NOT IN (SELECT RequirementId FROM @Wanted);
    DECLARE @Changed INT = @@ROWCOUNT;

    INSERT INTO app.RequirementTrace (ProjectId, RequirementId, ValidatesRequirementId, CreatedBy)
    SELECT @RowProjectId, @RequirementId, w.RequirementId, @ActorUserId
    FROM @Wanted AS w
    WHERE NOT EXISTS (SELECT 1 FROM app.RequirementTrace AS t
                      WHERE t.RequirementId = @RequirementId
                        AND t.ValidatesRequirementId = w.RequirementId);
    SET @Changed = @Changed + @@ROWCOUNT;

    IF @Changed > 0
        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'SetTraces', N'app.Requirement',
                CAST(@RequirementId AS NVARCHAR(64)), @Before,
                (SELECT t.ValidatesRequirementId AS id
                 FROM app.RequirementTrace AS t
                 WHERE t.RequirementId = @RequirementId
                 ORDER BY t.ValidatesRequirementId
                 FOR JSON PATH, INCLUDE_NULL_VALUES));
END;
GO
