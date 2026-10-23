-- usp_Requirement_ReplaceAllocations — set the deliverables one requirement is allocated to
-- (ADR-0037).
-- Internal: it runs inside a requirement write proc's transaction, after that proc's own access
--   check, so it asserts no access of its own and refuses to run outside a transaction. Named in
--   EXEMPT in src/tests/proc-access-levels.test.ts; a guardrail fails if any TS file calls it.
-- The project and the side come from the row, never from the caller. A missing deliverable and one
--   in another project answer alike. A new allocation goes last under its deliverable; a list that
--   loses one is renumbered 1..n.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_ReplaceAllocations
    @RequirementId INT,
    @Ids           NVARCHAR(MAX),
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Allocations are only replaced inside a requirement write', 1;

    DECLARE @RowProjectId INT, @RowType VARCHAR(3);
    SELECT @RowProjectId = ProjectId, @RowType = RequirementType
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    IF @Ids IS NULL OR ISJSON(@Ids) <> 1 OR LEFT(LTRIM(@Ids), 1) <> N'['
        THROW 50004, N'VALIDATION:Deliverables must be a JSON array', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Ids)
               WHERE [type] <> 2 OR TRY_CAST([value] AS INT) IS NULL OR TRY_CAST([value] AS INT) < 1)
        THROW 50004, N'VALIDATION:Each deliverable must be a positive number', 1;

    IF (SELECT COUNT(*) FROM OPENJSON(@Ids)) > 200
        THROW 50004, N'VALIDATION:A requirement can go to at most 200 deliverables', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Ids)
               GROUP BY TRY_CAST([value] AS INT) HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:A deliverable is listed twice', 1;

    DECLARE @Wanted TABLE (KeyDeliverableId INT PRIMARY KEY);
    INSERT INTO @Wanted (KeyDeliverableId)
    SELECT TRY_CAST([value] AS INT) FROM OPENJSON(@Ids);

    IF EXISTS (SELECT 1 FROM @Wanted) AND @RowType NOT IN ('FR', 'NFR', 'TR')
        THROW 50004, N'VALIDATION:This kind of requirement cannot be allocated', 1;

    IF EXISTS (SELECT 1 FROM @Wanted AS w
               WHERE NOT EXISTS (SELECT 1 FROM app.KeyDeliverable AS kd
                                 WHERE kd.KeyDeliverableId = w.KeyDeliverableId
                                   AND kd.ProjectId = @RowProjectId
                                   AND kd.IsDeleted = 0))
        THROW 50004, N'VALIDATION:A deliverable was not found', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT d.KeyDeliverableId AS id
         FROM app.RequirementDeliverable AS d
         WHERE d.RequirementId = @RequirementId
         ORDER BY d.KeyDeliverableId
         FOR JSON PATH, INCLUDE_NULL_VALUES);

    -- The deliverables that lose this requirement; their lists are renumbered below.
    DECLARE @Touched TABLE (KeyDeliverableId INT PRIMARY KEY);
    INSERT INTO @Touched (KeyDeliverableId)
    SELECT d.KeyDeliverableId
    FROM app.RequirementDeliverable AS d
    WHERE d.RequirementId = @RequirementId
      AND d.KeyDeliverableId NOT IN (SELECT KeyDeliverableId FROM @Wanted);

    DELETE d FROM app.RequirementDeliverable AS d
    WHERE d.RequirementId = @RequirementId
      AND d.KeyDeliverableId NOT IN (SELECT KeyDeliverableId FROM @Wanted);
    DECLARE @Changed INT = @@ROWCOUNT;

    -- One row per deliverable (the primary key), so MAX + 1 places each new one last.
    INSERT INTO app.RequirementDeliverable (ProjectId, RequirementId, KeyDeliverableId, SortOrder, CreatedBy)
    SELECT @RowProjectId, @RequirementId, w.KeyDeliverableId,
           ISNULL((SELECT MAX(x.SortOrder) FROM app.RequirementDeliverable AS x
                   WHERE x.KeyDeliverableId = w.KeyDeliverableId), 0) + 1,
           @ActorUserId
    FROM @Wanted AS w
    WHERE NOT EXISTS (SELECT 1 FROM app.RequirementDeliverable AS d
                      WHERE d.RequirementId = @RequirementId
                        AND d.KeyDeliverableId = w.KeyDeliverableId);
    SET @Changed = @Changed + @@ROWCOUNT;

    UPDATE d SET SortOrder = o.Position
    FROM app.RequirementDeliverable AS d
    JOIN (SELECT a.RequirementId, a.KeyDeliverableId,
                 ROW_NUMBER() OVER (PARTITION BY a.KeyDeliverableId
                                    ORDER BY a.SortOrder, a.RequirementId) AS Position
          FROM app.RequirementDeliverable AS a
          JOIN @Touched AS t ON t.KeyDeliverableId = a.KeyDeliverableId) AS o
        ON o.RequirementId = d.RequirementId AND o.KeyDeliverableId = d.KeyDeliverableId
    WHERE d.SortOrder <> o.Position;

    IF @Changed > 0
        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'SetAllocations', N'app.Requirement',
                CAST(@RequirementId AS NVARCHAR(64)), @Before,
                (SELECT d.KeyDeliverableId AS id
                 FROM app.RequirementDeliverable AS d
                 WHERE d.RequirementId = @RequirementId
                 ORDER BY d.KeyDeliverableId
                 FOR JSON PATH, INCLUDE_NULL_VALUES));
END;
GO
