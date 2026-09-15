-- usp_Supplier_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.Supplier (source: tbl3rdPartySupplier). Module: database-schema-and-procs (#3).
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
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Supplier WHERE SupplierId = @SupplierId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Supplier not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Supplier was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT SupplierId, [ProjectId], [SupplierName], [ContactPerson], [EmailAddress], [ContractStartDate], [ContractEndDate], [Rating], [Address], [ProvinceOrState], [Country], [PostalCode], [City]
         FROM app.Supplier WHERE SupplierId = @SupplierId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

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
    WHERE SupplierId = @SupplierId AND IsDeleted = 0;

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
