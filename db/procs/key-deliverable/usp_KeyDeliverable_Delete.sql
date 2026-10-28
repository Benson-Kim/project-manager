-- usp_KeyDeliverable_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass).
-- Work breakdown (ADR-0027): deleting an item deletes its whole branch (every sub-item, each
--   audited), removes the branch's allocations of requirements (ADR-0037) — the requirements
--   themselves stay in the register — and soft-deletes every dependency at either end of the
--   branch (ADR-0046), then its parents' dates are rolled up. The scheduler is not run: losing a
--   link only removes a constraint, and the cascade never pulls an item earlier (decision 7). The project row is
--   locked first so a concurrent move cannot slip an item into the branch while it is being
--   deleted. Returns the item's ProjectId.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Delete
    @KeyDeliverableId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    DECLARE @Branch TABLE (KeyDeliverableId INT PRIMARY KEY, BeforeJson NVARCHAR(MAX));
    INSERT INTO @Branch (KeyDeliverableId, BeforeJson)
    SELECT b.KeyDeliverableId,
           (SELECT kd.KeyDeliverableId, kd.[ProjectId], kd.ParentKeyDeliverableId, kd.[KeyRequirement],
                   kd.StartDate, kd.[Deadline], kd.[AssignedToStakeholderId], kd.[Priority], kd.[Status]
            FROM app.KeyDeliverable AS kd WHERE kd.KeyDeliverableId = b.KeyDeliverableId
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM dbo.ufn_KeyDeliverable_Branch(@KeyDeliverableId) AS b;

    UPDATE app.KeyDeliverable SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;
    END

    UPDATE kd SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    FROM app.KeyDeliverable AS kd
    JOIN @Branch AS b ON b.KeyDeliverableId = kd.KeyDeliverableId
    WHERE kd.IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    SELECT @ActorUserId, N'Delete', N'app.KeyDeliverable', CAST(b.KeyDeliverableId AS NVARCHAR(64)), b.BeforeJson
    FROM @Branch AS b;

    -- The branch's allocations go; the requirements stay in the register (ADR-0037). Touch each
    -- freed requirement so the Gantt freshness stamp moves.
    DECLARE @Allocations TABLE (RequirementId INT, KeyDeliverableId INT,
                                PRIMARY KEY (RequirementId, KeyDeliverableId));
    INSERT INTO @Allocations (RequirementId, KeyDeliverableId)
    SELECT d.RequirementId, d.KeyDeliverableId
    FROM app.RequirementDeliverable AS d
    JOIN @Branch AS b ON b.KeyDeliverableId = d.KeyDeliverableId;

    DELETE d
    FROM app.RequirementDeliverable AS d
    JOIN @Allocations AS a
        ON a.RequirementId = d.RequirementId AND a.KeyDeliverableId = d.KeyDeliverableId;

    UPDATE r SET
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.Requirement AS r
    WHERE r.RequirementId IN (SELECT RequirementId FROM @Allocations);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    SELECT @ActorUserId, N'Unallocate', N'app.RequirementDeliverable',
           CAST(a.RequirementId AS NVARCHAR(64)),
           (SELECT a.RequirementId AS requirementId, a.KeyDeliverableId AS keyDeliverableId
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM @Allocations AS a;

    -- Every dependency touching the branch goes with it, at either end, each audited (ADR-0046
    -- decision 5). Soft-deleted, so the filtered unique index lets the pair be linked again.
    DECLARE @Links TABLE (DependencyId INT PRIMARY KEY, BeforeJson NVARCHAR(MAX));
    INSERT INTO @Links (DependencyId, BeforeJson)
    SELECT d.DependencyId,
           (SELECT d.PredecessorId AS predecessorId, d.SuccessorId AS successorId,
                   d.DependencyType AS dependencyType, d.LagDays AS lagDays
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM app.KeyDeliverableDependency AS d
    WHERE d.IsDeleted = 0
      AND (   d.PredecessorId IN (SELECT KeyDeliverableId FROM @Branch)
           OR d.SuccessorId   IN (SELECT KeyDeliverableId FROM @Branch));

    UPDATE d SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    FROM app.KeyDeliverableDependency AS d
    JOIN @Links AS l ON l.DependencyId = d.DependencyId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    SELECT @ActorUserId, N'Delete', N'app.KeyDeliverableDependency',
           CAST(l.DependencyId AS NVARCHAR(64)), l.BeforeJson
    FROM @Links AS l;

    EXEC dbo.usp_KeyDeliverable_RollUp
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId, @FromKeyDeliverableId = @KeyDeliverableId;

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
