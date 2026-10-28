-- usp_KeyDeliverableDependency_Unlink — unlink two items (ADR-0046 decisions 5-10). Soft delete, so
-- the pair can be linked again: UX_KeyDeliverableDependency_Pair is filtered on IsDeleted = 0.
-- Access: Manager + key-deliverables:update on the link's project, read from the link row.
-- Rowversion concurrency on the link (50002 CONFLICT). Audited (Action 'Delete').
-- The scheduler does NOT run: taking a link away removes a constraint, and the cascade only ever
--   pushes items later (ADR-0046 decision 7), so nothing it held is pulled back. The bars stay
--   where they are and the person moves them.
-- Entity app.KeyDeliverableDependency. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverableDependency_Unlink
    @DependencyId INT,
    @RowVer       BIGINT,
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @PredecessorId INT, @SuccessorId INT,
            @DependencyType CHAR(2), @LagDays INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId,
           @PredecessorId = PredecessorId, @SuccessorId = SuccessorId,
           @DependencyType = DependencyType, @LagDays = LagDays
    FROM app.KeyDeliverableDependency
    WHERE DependencyId = @DependencyId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Dependency not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Dependency was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    UPDATE app.KeyDeliverableDependency SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE DependencyId = @DependencyId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Dependency was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.KeyDeliverableDependency',
            CAST(@DependencyId AS NVARCHAR(64)),
            (SELECT @PredecessorId AS predecessorId, @SuccessorId AS successorId,
                    @DependencyType AS dependencyType, @LagDays AS lagDays
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
