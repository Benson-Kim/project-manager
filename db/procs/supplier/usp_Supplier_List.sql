-- usp_Supplier_List — paged/filtered list per ADR-0016. Search columns: SupplierName, ContactPerson, City. Sort whitelist: SupplierName, ContractStartDate, ContractEndDate, Rating.
-- Entity app.Supplier (source: tbl3rdPartySupplier). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Supplier_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

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
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.Supplier
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [SupplierName] LIKE N'%' + @Search + N'%'
           OR [ContactPerson] LIKE N'%' + @Search + N'%'
           OR [City] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'SupplierName' AND @SortDir = 'asc'  THEN [SupplierName] END ASC,
        CASE WHEN @SortBy = N'SupplierName' AND @SortDir = 'desc' THEN [SupplierName] END DESC,
        CASE WHEN @SortBy = N'ContractStartDate' AND @SortDir = 'asc'  THEN [ContractStartDate] END ASC,
        CASE WHEN @SortBy = N'ContractStartDate' AND @SortDir = 'desc' THEN [ContractStartDate] END DESC,
        CASE WHEN @SortBy = N'ContractEndDate' AND @SortDir = 'asc'  THEN [ContractEndDate] END ASC,
        CASE WHEN @SortBy = N'ContractEndDate' AND @SortDir = 'desc' THEN [ContractEndDate] END DESC,
        CASE WHEN @SortBy = N'Rating' AND @SortDir = 'asc'  THEN [Rating] END ASC,
        CASE WHEN @SortBy = N'Rating' AND @SortDir = 'desc' THEN [Rating] END DESC,
        SupplierId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
