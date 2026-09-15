-- usp_ItResourceCategory_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.ItResourceCategory (source: tblITResourcePlanning). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ItResourceCategory_Delete
    @ItResourceCategoryId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.ItResourceCategory WHERE ItResourceCategoryId = @ItResourceCategoryId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:ItResourceCategory not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:ItResourceCategory was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ItResourceCategoryId, [ProjectId], [Resource]
         FROM app.ItResourceCategory WHERE ItResourceCategoryId = @ItResourceCategoryId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ItResourceCategory SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE ItResourceCategoryId = @ItResourceCategoryId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.ItResourceCategory', CAST(@ItResourceCategoryId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
