-- usp_KeyDeliverableDependency_Relink — change a link's type or its lag (ADR-0046 decisions 5-10).
-- The two ends never change: re-pointing a link is an unlink and a new link, so the cycle and
--   ancestor rules stay where they are made, in _Create.
-- Access: Manager + key-deliverables:update on the link's project, read from the link row.
-- Rowversion concurrency on the link (50002 CONFLICT). Audited (Action 'Update').
-- A retyped or re-lagged link can be violated at once, so the scheduler runs before the commit.
--   Changing nothing writes nothing, so a replayed save is idempotent rather than a CONFLICT.
-- Entity app.KeyDeliverableDependency. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverableDependency_Relink
    @DependencyId   INT,
    @DependencyType CHAR(2),
    @LagDays        INT,
    @RowVer         BIGINT,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @DependencyType NOT IN ('FS', 'SS', 'FF', 'SF')
        THROW 50004, N'VALIDATION:Unknown dependency type', 1;
    IF @LagDays IS NULL OR @LagDays NOT BETWEEN -3650 AND 3650
        THROW 50004, N'VALIDATION:Lag must be between -3650 and 3650 days', 1;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @CurrentType CHAR(2), @CurrentLag INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId,
           @CurrentType = DependencyType, @CurrentLag = LagDays
    FROM app.KeyDeliverableDependency
    WHERE DependencyId = @DependencyId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Dependency not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Dependency was modified by someone else', 1;

    -- Already what it is being set to: nothing to write and nothing to reschedule.
    IF @CurrentType = @DependencyType AND @CurrentLag = @LagDays
    BEGIN
        SELECT @RowProjectId AS ProjectId;
        RETURN;
    END

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    UPDATE app.KeyDeliverableDependency SET
        DependencyType = @DependencyType,
        LagDays        = @LagDays,
        UpdatedAtUtc   = SYSUTCDATETIME(),
        UpdatedBy      = @ActorUserId
    WHERE DependencyId = @DependencyId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Dependency was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverableDependency',
            CAST(@DependencyId AS NVARCHAR(64)),
            (SELECT @CurrentType AS dependencyType, @CurrentLag AS lagDays
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @DependencyType AS dependencyType, @LagDays AS lagDays
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    EXEC dbo.usp_KeyDeliverable_CascadeDependencies
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId;

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
