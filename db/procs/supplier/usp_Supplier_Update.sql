-- usp_Supplier_Update — full-row update with atomic rowversion concurrency (50002 CONFLICT),
--   actor project-scope guard (50003 FORBIDDEN_ROW), and in-transaction audit.
-- RowVer is included in the UPDATE predicate (not pre-checked) to eliminate the TOCTOU race
--   where two requests pass the pre-check before either write completes.
-- Admin bypass: @ActorRole = N'Admin' skips both project-scope checks.
-- Destination-project check: when @ProjectId differs from the row's current ProjectId,
--   the actor must also be assigned to the destination project.
-- Entity app.Supplier (source: tbl3rdPartySupplier). Module: suppliers (#7).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Supplier_Update
    @SupplierId INT,
    @ProjectId INT,
    @SupplierName NVARCHAR(255),
    @ContactPerson NVARCHAR(255) = NULL,
    @EmailAddress NVARCHAR(255) = NULL,
    @ContractStartDate DATETIME2 = NULL,
    @ContractEndDate DATETIME2 = NULL,
    @Rating NVARCHAR(255) = NULL,
    @Address NVARCHAR(255) = NULL,
    @ProvinceOrState NVARCHAR(255) = NULL,
    @Country NVARCHAR(255) = NULL,
    @PostalCode NVARCHAR(255) = NULL,
    @City NVARCHAR(255) = NULL,
    @RowVer BIGINT,
    @ActorUserId INT,
    @ActorRole NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Verify the row exists (NOT_FOUND) before entering the transaction so we
    -- give a useful error even when RowVer is stale.
    IF NOT EXISTS (SELECT 1 FROM app.Supplier WHERE SupplierId = @SupplierId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Supplier not found', 1;

    -- (1) Actor must be assigned to the row's current (owning) project.
    --     Admin role bypasses this check.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.Supplier s
           JOIN app.ProjectAssignee pa ON pa.ProjectId = s.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE s.SupplierId = @SupplierId AND s.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    -- (2) Actor must also be assigned to the destination project when ProjectId is changing.
    --     Admin role bypasses this check.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @ProjectId AND UserId = @ActorUserId AND IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to the destination project', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT SupplierId, [ProjectId], [SupplierName], [ContactPerson], [EmailAddress], [ContractStartDate], [ContractEndDate], [Rating], [Address], [ProvinceOrState], [Country], [PostalCode], [City]
         FROM app.Supplier WHERE SupplierId = @SupplierId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic update: RowVer in the WHERE predicate eliminates the TOCTOU window.
    -- If @@ROWCOUNT = 0 the row was modified concurrently (or disappeared).
    UPDATE app.Supplier SET
        [ProjectId] = @ProjectId,
        [SupplierName] = @SupplierName,
        [ContactPerson] = @ContactPerson,
        [EmailAddress] = @EmailAddress,
        [ContractStartDate] = @ContractStartDate,
        [ContractEndDate] = @ContractEndDate,
        [Rating] = @Rating,
        [Address] = @Address,
        [ProvinceOrState] = @ProvinceOrState,
        [Country] = @Country,
        [PostalCode] = @PostalCode,
        [City] = @City,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE SupplierId = @SupplierId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Supplier was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Supplier', CAST(@SupplierId AS NVARCHAR(64)), @Before,
            (SELECT SupplierId, [ProjectId], [SupplierName], [ContactPerson], [EmailAddress], [ContractStartDate], [ContractEndDate], [Rating], [Address], [ProvinceOrState], [Country], [PostalCode], [City]
             FROM app.Supplier WHERE SupplierId = @SupplierId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT SupplierId,
           [ProjectId],
           [SupplierName],
           [ContactPerson],
           [EmailAddress],
           [ContractStartDate],
           [ContractEndDate],
           [Rating],
           [Address],
           [ProvinceOrState],
           [Country],
           [PostalCode],
           [City],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Supplier
    WHERE SupplierId = @SupplierId;
END;
GO
