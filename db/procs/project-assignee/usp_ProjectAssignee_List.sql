-- usp_ProjectAssignee_List — paged/filtered list per ADR-0016. Search columns: PersonName. Sort whitelist: PersonName, Role.
-- Entity app.ProjectAssignee (source: (new — req 0.3 one-or-many PMs/sponsors/BAs)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectAssignee_List
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

    SELECT ProjectAssigneeId,
           [ProjectId],
           [Role],
           [PersonName],
           [UserId],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.ProjectAssignee
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [PersonName] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'PersonName' AND @SortDir = 'asc'  THEN [PersonName] END ASC,
        CASE WHEN @SortBy = N'PersonName' AND @SortDir = 'desc' THEN [PersonName] END DESC,
        CASE WHEN @SortBy = N'Role' AND @SortDir = 'asc'  THEN [Role] END ASC,
        CASE WHEN @SortBy = N'Role' AND @SortDir = 'desc' THEN [Role] END DESC,
        ProjectAssigneeId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
