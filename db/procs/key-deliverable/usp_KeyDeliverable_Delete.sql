-- usp_KeyDeliverable_Delete — soft delete with rowversion concurrency + in-transaction audit.
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

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [Deadline], [AssignedToStakeholderId], [Priority], [Status]
         FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.KeyDeliverable SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
