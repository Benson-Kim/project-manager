-- usp_NoteTab_List — paged/filtered list per ADR-0016. Search columns: Title. Sort whitelist: SortOrder, Title.
-- Entity app.NoteTab (source: (new — titled tabs per checklist rows 17-20)). Module: database-schema-and-procs (#3).

-- @ProjectId is accepted for contract uniformity but ignored (entity is not project-scoped).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @NoteId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT NoteTabId,
           [NoteId],
           [Title],
           [Content],
           [SortOrder],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.NoteTab
    WHERE IsDeleted = 0
      AND (@NoteId IS NULL OR [NoteId] = @NoteId)
      AND (@Search IS NULL OR [Title] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'SortOrder' AND @SortDir = 'asc'  THEN [SortOrder] END ASC,
        CASE WHEN @SortBy = N'SortOrder' AND @SortDir = 'desc' THEN [SortOrder] END DESC,
        CASE WHEN @SortBy = N'Title' AND @SortDir = 'asc'  THEN [Title] END ASC,
        CASE WHEN @SortBy = N'Title' AND @SortDir = 'desc' THEN [Title] END DESC,
        NoteTabId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
