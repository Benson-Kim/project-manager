-- usp_ItResourceItem_List — paged/filtered list per ADR-0016. Search columns: DetailText. Sort whitelist: (default ItResourceItemId only).
-- Entity app.ItResourceItem (source: tblITResourcePlanningDetails). Module: database-schema-and-procs (#3).

-- @ProjectId is accepted for contract uniformity but ignored (entity is not project-scoped).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ItResourceItem_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @ItResourceCategoryId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT ItResourceItemId,
           [ItResourceCategoryId],
           [DetailText],
           [Needed],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.ItResourceItem
    WHERE IsDeleted = 0
      AND (@ItResourceCategoryId IS NULL OR [ItResourceCategoryId] = @ItResourceCategoryId)
      AND (@Search IS NULL OR [DetailText] LIKE N'%' + @Search + N'%')
    ORDER BY
        ItResourceItemId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
