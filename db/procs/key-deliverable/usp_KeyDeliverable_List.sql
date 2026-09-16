-- usp_KeyDeliverable_List — paged/filtered list per ADR-0016. Search columns: KeyRequirement. Sort whitelist: Deadline, Priority, Status.
-- Filters @Status/@Priority added by module #9 (list page filter bar).
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @Status      NVARCHAR(255) = NULL,
    @Priority    NVARCHAR(255) = NULL,
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

    SELECT KeyDeliverableId,
           [ProjectId],
           [KeyRequirement],
           [Deadline],
           [AssignedToStakeholderId],
           [Priority],
           [Status],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.KeyDeliverable
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [KeyRequirement] LIKE N'%' + @Search + N'%')
      AND (@Status IS NULL OR [Status] = @Status)
      AND (@Priority IS NULL OR [Priority] = @Priority)
    ORDER BY
        CASE WHEN @SortBy = N'Deadline' AND @SortDir = 'asc'  THEN [Deadline] END ASC,
        CASE WHEN @SortBy = N'Deadline' AND @SortDir = 'desc' THEN [Deadline] END DESC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'asc'  THEN [Priority] END ASC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'desc' THEN [Priority] END DESC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'asc'  THEN [Status] END ASC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'desc' THEN [Status] END DESC,
        KeyDeliverableId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
