-- usp_KeyDeliverable_SetStatus — change only an item's status, picked from the WBS or Gantt menu
-- (client feedback 2026-10-20, ADR-0036). The item's colour follows its status, so this is also how
-- a box or bar changes colour. The full-row usp_KeyDeliverable_Update would need every other field.
-- The status must be a live option of 'key-deliverable.status', or unchanged (ADR-0022, VALIDATION
--   50004); NULL clears it.
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass); rowversion concurrency (50002 CONFLICT). Locks the project
--   row first, like every write to the breakdown (ADR-0027 §5). Audited in-transaction.
-- Returns the item's ProjectId.
-- Entity app.KeyDeliverable. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_SetStatus
    @KeyDeliverableId INT,
    @Status           NVARCHAR(255) = NULL,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @CurrentStatus NVARCHAR(255);
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId, @CurrentStatus = [Status]
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'key-deliverable.status', @Label = @Status OUTPUT,
         @CurrentLabel = @CurrentStatus;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    UPDATE app.KeyDeliverable SET
        [Status]     = @Status,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)),
            (SELECT @CurrentStatus AS [Status] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @Status AS [Status] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
