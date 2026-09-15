-- usp_ItResourceItem_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.ItResourceItem (source: tblITResourcePlanningDetails). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ItResourceItem_Delete
    @ItResourceItemId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.ItResourceItem WHERE ItResourceItemId = @ItResourceItemId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:ItResourceItem not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:ItResourceItem was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ItResourceItemId, [ItResourceCategoryId], [DetailText], [Needed]
         FROM app.ItResourceItem WHERE ItResourceItemId = @ItResourceItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ItResourceItem SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE ItResourceItemId = @ItResourceItemId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.ItResourceItem', CAST(@ItResourceItemId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
