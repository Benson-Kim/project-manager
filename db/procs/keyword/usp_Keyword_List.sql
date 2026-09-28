-- usp_Keyword_List — paged/filtered list per ADR-0016. Search columns: Keyword, Definition. Sort whitelist: Keyword.
-- @ProjectId = non-NULL: returns rows for that project only (project-scoped keywords).
-- @ProjectId = NULL: returns all non-deleted rows (used by admin/global views).
-- C9-7 fix: removed OR ProjectId IS NULL from the project-scoped WHERE clause. Global keywords
--   (ProjectId IS NULL) are not shown in project views because guardProjectScope rejects them and
--   they become permanently uneditable/unviewable via the project UI. Global keywords will be
--   managed through the admin/global view (ProjectId = NULL caller) when that module lands.
-- Entity app.Keyword (source: tblAcronyms → app.Keyword). Module: keywords (#8).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_List
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

    SELECT KeywordId,
           [ProjectId],
           [Keyword],
           [Definition],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.Keyword
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [Keyword] LIKE N'%' + @Search + N'%'
           OR [Definition] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'Keyword' AND @SortDir = 'asc'  THEN [Keyword] END ASC,
        CASE WHEN @SortBy = N'Keyword' AND @SortDir = 'desc' THEN [Keyword] END DESC,
        KeywordId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
