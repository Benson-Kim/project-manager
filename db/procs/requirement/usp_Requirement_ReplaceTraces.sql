-- usp_Requirement_ReplaceTraces — set what one requirement traces to (ADR-0037, ADR-0060). A new
--   link needs a row in app.RequirementLinkRule; a kept link is not judged again, so removing a
--   rule leaves existing links alone, and a kept link keeps its rationale and status.
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
               WHERE NOT EXISTS (SELECT 1 FROM app.RequirementTrace AS k
                                 WHERE k.RequirementId = @RequirementId
                                   AND k.ValidatesRequirementId = w.RequirementId)
                 AND NOT EXISTS (SELECT 1 FROM app.RequirementLinkRule AS r
                                 WHERE r.DownstreamType = @RowType
                                   AND r.UpstreamType = t.RequirementType))
        THROW 50004, N'VALIDATION:The link settings do not allow this link', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT t.ValidatesRequirementId AS id
         FROM app.RequirementTrace AS t
         WHERE t.RequirementId = @RequirementId
         ORDER BY t.ValidatesRequirementId
         FOR JSON PATH, INCLUDE_NULL_VALUES);

    -- The sheet never sees a Retired link, so its absence here is not a request to remove it.
    DELETE t FROM app.RequirementTrace AS t
    WHERE t.RequirementId = @RequirementId
      AND t.LinkStatus <> 'Retired'
      AND t.ValidatesRequirementId NOT IN (SELECT RequirementId FROM @Wanted);
    DECLARE @Changed INT = @@ROWCOUNT;

    UPDATE t SET LinkStatus = 'Active', UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    FROM app.RequirementTrace AS t
    JOIN @Wanted AS w ON w.RequirementId = t.ValidatesRequirementId
    WHERE t.RequirementId = @RequirementId AND t.LinkStatus = 'Retired';
    SET @Changed = @Changed + @@ROWCOUNT;

    INSERT INTO app.RequirementTrace (ProjectId, RequirementId, ValidatesRequirementId, CreatedBy)
    SELECT @RowProjectId, @RequirementId, w.RequirementId, @ActorUserId
    FROM @Wanted AS w
    WHERE NOT EXISTS (SELECT 1 FROM app.RequirementTrace AS t
                      WHERE t.RequirementId = @RequirementId
                        AND t.ValidatesRequirementId = w.RequirementId);
    SET @Changed = @Changed + @@ROWCOUNT;

    IF @Changed > 0 AND EXISTS (SELECT 1 FROM @Wanted)
        EXEC dbo.usp_Requirement_AssertNoLinkLoop @RequirementId = @RequirementId;

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
