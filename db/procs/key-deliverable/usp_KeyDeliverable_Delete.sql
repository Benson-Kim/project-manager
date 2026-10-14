-- usp_KeyDeliverable_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass).
-- Work breakdown (ADR-0027): deleting an item deletes its whole branch (every sub-item, each
--   audited), then its parents' dates are rolled up. The project row is locked first so a
--   concurrent move cannot slip an item into the branch while it is being deleted.
--   Returns the item's ProjectId.
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

    EXEC dbo.usp_KeyDeliverable_RollUp
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId, @FromKeyDeliverableId = @KeyDeliverableId;

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
