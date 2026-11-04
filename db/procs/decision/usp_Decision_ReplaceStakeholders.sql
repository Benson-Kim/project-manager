-- usp_Decision_ReplaceStakeholders — set the people consulted on one decision (ADR-0055).
-- Internal: it runs inside a decision write proc's transaction, after that proc's own access
--   check, so it asserts no access of its own and refuses to run outside a transaction. Named in
--   EXEMPT in src/tests/proc-access-levels.test.ts; a guardrail fails if any TS file calls it.
-- The project comes from the row, never from the caller. A missing stakeholder and one in another
--   project answer alike, so a list cannot probe for ids.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Decision_ReplaceStakeholders
    @DecisionId  INT,
    @Ids         NVARCHAR(MAX),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Consulted stakeholders are only replaced inside a decision write', 1;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.Decision WHERE DecisionId = @DecisionId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Decision not found', 1;

    IF @Ids IS NULL OR ISJSON(@Ids) <> 1 OR LEFT(LTRIM(@Ids), 1) <> N'['
        THROW 50004, N'VALIDATION:Consulted stakeholders must be a JSON array', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Ids)
               WHERE [type] <> 2 OR TRY_CAST([value] AS INT) IS NULL OR TRY_CAST([value] AS INT) < 1)
        THROW 50004, N'VALIDATION:Each consulted stakeholder must be a positive number', 1;

    IF (SELECT COUNT(*) FROM OPENJSON(@Ids)) > 200
        THROW 50004, N'VALIDATION:A decision can consult at most 200 stakeholders', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Ids)
               GROUP BY TRY_CAST([value] AS INT) HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:A consulted stakeholder is listed twice', 1;

    DECLARE @Wanted TABLE (StakeholderId INT PRIMARY KEY);
    INSERT INTO @Wanted (StakeholderId)
    SELECT TRY_CAST([value] AS INT) FROM OPENJSON(@Ids);

    IF EXISTS (SELECT 1 FROM @Wanted AS w
               WHERE NOT EXISTS (SELECT 1 FROM app.Stakeholder AS s
                                 WHERE s.StakeholderId = w.StakeholderId
                                   AND s.ProjectId = @RowProjectId
                                   AND s.IsDeleted = 0))
        THROW 50004, N'VALIDATION:A consulted stakeholder was not found', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT s.StakeholderId AS id
         FROM app.DecisionStakeholder AS s
         WHERE s.DecisionId = @DecisionId
         ORDER BY s.StakeholderId
         FOR JSON PATH, INCLUDE_NULL_VALUES);

    DELETE s FROM app.DecisionStakeholder AS s
    WHERE s.DecisionId = @DecisionId
      AND s.StakeholderId NOT IN (SELECT StakeholderId FROM @Wanted);
    DECLARE @Changed INT = @@ROWCOUNT;

    INSERT INTO app.DecisionStakeholder (DecisionId, ProjectId, StakeholderId, CreatedBy)
    SELECT @DecisionId, @RowProjectId, w.StakeholderId, @ActorUserId
    FROM @Wanted AS w
    WHERE NOT EXISTS (SELECT 1 FROM app.DecisionStakeholder AS s
                      WHERE s.DecisionId = @DecisionId AND s.StakeholderId = w.StakeholderId);
    SET @Changed = @Changed + @@ROWCOUNT;

    IF @Changed > 0
        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'SetStakeholders', N'app.Decision',
                CAST(@DecisionId AS NVARCHAR(64)), @Before,
                (SELECT s.StakeholderId AS id
                 FROM app.DecisionStakeholder AS s
                 WHERE s.DecisionId = @DecisionId
                 ORDER BY s.StakeholderId
                 FOR JSON PATH, INCLUDE_NULL_VALUES));
END;
GO
