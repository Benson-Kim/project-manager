-- usp_KeyDeliverableDependency_Link — link two work breakdown items in sequence (ADR-0046
-- decisions 5-10). The link is typed FS/SS/FF/SF with a lag in days; the type is a property of the
-- link, so a pair is never joined twice to carry two of them.
-- Access: Manager + key-deliverables:update on the project both items belong to. The project is
--   read from the predecessor's row, never from the caller, and the successor must be in that same
--   project — the composite foreign keys hold that too, but a VALIDATION says why.
-- Four rules cannot be constraints because each spans rows. All are taken after the app.Project
--   (UPDLOCK, HOLDLOCK) that ADR-0027 decision 4 requires, so a concurrent link cannot slip past
--   them: no duplicate live pair, no self-link, no pair where one item is the other's ancestor or
--   descendant (a summary already contains its branch), and no cycle.
-- A new link can be violated the moment it is made, so the scheduler runs before the commit and
--   the answer carries whatever it moved (decision 10).
-- The row is read before access is asserted, as every proc in this module does; collapsing that
--   existence oracle is ADR-0040's own branch, not this one's.
-- Audited (Action 'Create'). Returns the new DependencyId and the project id.
-- Entity app.KeyDeliverableDependency. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverableDependency_Link
    @PredecessorId  INT,
    @SuccessorId    INT,
    @DependencyType CHAR(2),
    @LagDays        INT = 0,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @DependencyType NOT IN ('FS', 'SS', 'FF', 'SF')
        THROW 50004, N'VALIDATION:Unknown dependency type', 1;
    IF @LagDays IS NULL OR @LagDays NOT BETWEEN -3650 AND 3650
        THROW 50004, N'VALIDATION:Lag must be between -3650 and 3650 days', 1;
    IF @PredecessorId = @SuccessorId
        THROW 50004, N'VALIDATION:An item cannot depend on itself', 1;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.KeyDeliverable
    WHERE KeyDeliverableId = @PredecessorId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverable
                   WHERE KeyDeliverableId = @SuccessorId AND IsDeleted = 0
                     AND ProjectId = @RowProjectId)
        THROW 50004, N'VALIDATION:Both items must be in the same project', 1;

    IF EXISTS (SELECT 1 FROM app.KeyDeliverableDependency
               WHERE PredecessorId = @PredecessorId AND SuccessorId = @SuccessorId
                 AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:These items are already linked', 1;

    IF EXISTS (SELECT 1 FROM dbo.ufn_KeyDeliverable_Branch(@PredecessorId)
               WHERE KeyDeliverableId = @SuccessorId)
       OR EXISTS (SELECT 1 FROM dbo.ufn_KeyDeliverable_Branch(@SuccessorId)
                  WHERE KeyDeliverableId = @PredecessorId)
        THROW 50004, N'VALIDATION:An item cannot depend on its own sub-item or summary', 1;

    -- Everything reachable by following links forward from the successor. If the predecessor is in
    -- there, this link would close a loop.
    DECLARE @Downstream TABLE (Id INT PRIMARY KEY);
    WITH downstream AS (
        SELECT d.SuccessorId AS Id, 0 AS Lvl
        FROM app.KeyDeliverableDependency AS d
        WHERE d.PredecessorId = @SuccessorId AND d.IsDeleted = 0 AND d.ProjectId = @RowProjectId
        UNION ALL
        SELECT d.SuccessorId, u.Lvl + 1
        FROM downstream AS u
        JOIN app.KeyDeliverableDependency AS d
            ON d.PredecessorId = u.Id AND d.IsDeleted = 0 AND d.ProjectId = @RowProjectId
        WHERE u.Lvl < 50
    )
    INSERT INTO @Downstream (Id)
    SELECT DISTINCT Id FROM downstream;

    IF EXISTS (SELECT 1 FROM @Downstream WHERE Id = @PredecessorId)
        THROW 50004, N'VALIDATION:That would make a loop of dependencies', 1;

    INSERT INTO app.KeyDeliverableDependency
        (ProjectId, PredecessorId, SuccessorId, DependencyType, LagDays, CreatedBy)
    VALUES (@RowProjectId, @PredecessorId, @SuccessorId, @DependencyType, @LagDays, @ActorUserId);

    DECLARE @DependencyId INT = CAST(SCOPE_IDENTITY() AS INT);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.KeyDeliverableDependency',
            CAST(@DependencyId AS NVARCHAR(64)),
            (SELECT @PredecessorId AS predecessorId, @SuccessorId AS successorId,
                    @DependencyType AS dependencyType, @LagDays AS lagDays
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    EXEC dbo.usp_KeyDeliverable_CascadeDependencies
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId;

    COMMIT;

    SELECT @DependencyId AS DependencyId, @RowProjectId AS ProjectId;
END;
GO
