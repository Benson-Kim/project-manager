-- usp_Supplier_GetById — fetch one active app.Supplier row; THROW 50001 when absent/soft-deleted.
-- Entity app.Supplier (source: tbl3rdPartySupplier). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Supplier_GetById
    @SupplierId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Supplier WHERE SupplierId = @SupplierId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Supplier not found', 1;

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
    WHERE SupplierId = @SupplierId AND IsDeleted = 0;
END;
GO
