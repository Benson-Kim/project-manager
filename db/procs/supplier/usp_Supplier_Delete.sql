-- usp_Supplier_Delete — soft delete with atomic rowversion concurrency + actor scope + in-transaction audit.
-- RowVer is included in the UPDATE predicate to eliminate the TOCTOU race (same fix as Update).
-- Row-level access: the actor needs Manager on the row's project (dbo.usp_Project_AssertAccess,
--   ADR-0021; FORBIDDEN_ROW 50003). Admins hold Manager everywhere.
-- Entity app.Supplier (source: tbl3rdPartySupplier). Module: suppliers (#7).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Supplier_Delete
    @SupplierId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Supplier WHERE SupplierId = @SupplierId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Supplier not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT SupplierId, [ProjectId], [SupplierName], [ContactPerson], [EmailAddress], [ContractStartDate], [ContractEndDate], [Rating], [Address], [ProvinceOrState], [Country], [PostalCode], [City]
         FROM app.Supplier WHERE SupplierId = @SupplierId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic soft-delete: RowVer in the WHERE predicate eliminates the TOCTOU window.
    UPDATE app.Supplier SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE SupplierId = @SupplierId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Supplier was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Supplier', CAST(@SupplierId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
