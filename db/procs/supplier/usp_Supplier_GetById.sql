-- usp_Supplier_GetById — fetch one active app.Supplier row; THROW 50001 when absent/soft-deleted.
-- Actor project-scope: @ActorUserId must be an assignee of the owning project (FORBIDDEN_ROW 50003).
-- Admin bypass: an Admin actor (role read from auth.User) skips the project-scope check.
-- Entity app.Supplier (source: tbl3rdPartySupplier). Module: suppliers (#7).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Supplier_GetById
    @SupplierId  INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Supplier WHERE SupplierId = @SupplierId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Supplier not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

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
