-- usp_KeyDeliverable_SetStatus — change only an item's status; its colour follows (ADR-0036).
-- Returns the item's ProjectId.
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
