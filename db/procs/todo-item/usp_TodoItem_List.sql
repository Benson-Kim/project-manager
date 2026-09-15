-- usp_TodoItem_List — paged/filtered list per ADR-0016. Search columns: TodoItem. Sort whitelist: DueDate, Priority, Status, StartDate.
-- Entity app.TodoItem (source: tblTodoList (core; alert columns → TodoAlert)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_List
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

    SELECT TodoItemId,
           [ProjectId],
           [DailyActivityId],
           [ProjectOrActivity],
           [TodoItem],
           [StartDate],
           [DueDate],
           [Priority],
           [Status],
           [Notes],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.TodoItem
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [TodoItem] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'DueDate' AND @SortDir = 'asc'  THEN [DueDate] END ASC,
        CASE WHEN @SortBy = N'DueDate' AND @SortDir = 'desc' THEN [DueDate] END DESC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'asc'  THEN [Priority] END ASC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'desc' THEN [Priority] END DESC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'asc'  THEN [Status] END ASC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'desc' THEN [Status] END DESC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'asc'  THEN [StartDate] END ASC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'desc' THEN [StartDate] END DESC,
        TodoItemId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
