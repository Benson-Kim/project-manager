-- usp_ExistingSystemInterface_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.ExistingSystemInterface (source: tblExistingSystemsInterfaces). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ExistingSystemInterface_Delete
    @ExistingSystemInterfaceId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.ExistingSystemInterface WHERE ExistingSystemInterfaceId = @ExistingSystemInterfaceId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:ExistingSystemInterface not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:ExistingSystemInterface was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ExistingSystemInterfaceId, [ProjectId], [HasInterface], [Notes], [Location]
         FROM app.ExistingSystemInterface WHERE ExistingSystemInterfaceId = @ExistingSystemInterfaceId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ExistingSystemInterface SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE ExistingSystemInterfaceId = @ExistingSystemInterfaceId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.ExistingSystemInterface', CAST(@ExistingSystemInterfaceId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
