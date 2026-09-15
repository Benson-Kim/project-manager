-- usp_Keyword_List — paged/filtered list per ADR-0016. Search columns: Acronym, Definition. Sort whitelist: Acronym.
-- Entity app.Keyword (source: tblAcronyms). Module: database-schema-and-procs (#3).
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
           [Acronym],
           [Definition],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.Keyword
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [Acronym] LIKE N'%' + @Search + N'%'
           OR [Definition] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'Acronym' AND @SortDir = 'asc'  THEN [Acronym] END ASC,
        CASE WHEN @SortBy = N'Acronym' AND @SortDir = 'desc' THEN [Acronym] END DESC,
        KeywordId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
