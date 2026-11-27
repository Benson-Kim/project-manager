-- usp_SupplierColumn_Rename — rename a column the project added (ADR-0067). Its values are keyed
--   by the column's id, so they stay exactly where they are.
-- Access: Manager + suppliers:update. A stale @RowVer answers 409. Audits old and new name.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_SupplierColumn_Rename
    @SupplierColumnId INT,
    @Name                NVARCHAR(200),
    @RowVer              BIGINT,
    @BuiltInJson         NVARCHAR(MAX),
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT, @Old NVARCHAR(80);
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @Old = Name
    FROM app.SupplierColumn WHERE SupplierColumnId = @SupplierColumnId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'suppliers:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    EXEC dbo.usp_SupplierColumn_AssertName
         @ProjectId = @ProjectId, @Name = @Name, @BuiltInJson = @BuiltInJson,
         @ExceptColumnId = @SupplierColumnId;

    UPDATE app.SupplierColumn SET Name = @Name, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE SupplierColumnId = @SupplierColumnId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Rename', N'app.SupplierColumn', CAST(@SupplierColumnId AS NVARCHAR(64)),
            (SELECT @Old AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Name AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT SupplierColumnId, Name, Kind, SortOrder, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.SupplierColumn WHERE SupplierColumnId = @SupplierColumnId;
END;
GO
