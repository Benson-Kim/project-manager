-- usp_Keyword_List — paged/filtered list per ADR-0016. Search columns: Keyword, Definition. Sort whitelist: Keyword.
-- Actor project-scope: when @ProjectId is supplied and actor is not Admin, they must be an assignee
--   (FORBIDDEN_ROW 50003). Global keywords (ProjectId NULL) are shown when @ProjectId is NULL.
-- Entity app.Keyword (source: tblKeywords). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_List
    @ActorUserId INT,
    @ActorRole   NVARCHAR(50)  = NULL,
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

    -- When @ProjectId is supplied, non-Admin actors must be assigned to that project.
    IF @ProjectId IS NOT NULL
       AND ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee pa
           WHERE pa.ProjectId = @ProjectId AND pa.UserId = @ActorUserId AND pa.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
