-- usp_TodoItem_List — paged/filtered list per ADR-0016. Search columns: TodoItem. Sort whitelist: DueDate, Priority, Status, StartDate.
-- Filter params: @Status (exact match), @Priority (exact match), @ProjectOrActivity (exact match).
-- Entity app.TodoItem (source: tblTodoList (core; alert columns → TodoAlert)). Module: todo-items (#20).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_List
    @ActorUserId       INT,
    @ProjectId         INT           = NULL,
    @Search            NVARCHAR(100) = NULL,
    @SortBy            NVARCHAR(50)  = NULL,
    @SortDir           VARCHAR(4)    = 'asc',
    @Page              INT           = 1,
    @PageSize          INT           = 25,
    @Status            NVARCHAR(255) = NULL,
    @Priority          NVARCHAR(255) = NULL,
    @ProjectOrActivity NVARCHAR(50)  = NULL
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
           [SortKey],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.TodoItem
    WHERE IsDeleted = 0
      AND (@ProjectId         IS NULL OR ProjectId         = @ProjectId)
      AND (@Search            IS NULL OR [TodoItem] LIKE N'%' + @Search + N'%')
      AND (@Status            IS NULL OR [Status]           = @Status)
      AND (@Priority          IS NULL OR [Priority]         = @Priority)
      AND (@ProjectOrActivity IS NULL OR [ProjectOrActivity] = @ProjectOrActivity)
    ORDER BY
        CASE WHEN @SortBy = N'DueDate'    AND @SortDir = 'asc'  THEN [DueDate]    END ASC,
        CASE WHEN @SortBy = N'DueDate'    AND @SortDir = 'desc' THEN [DueDate]    END DESC,
        CASE WHEN @SortBy = N'Priority'   AND @SortDir = 'asc'  THEN [Priority]   END ASC,
        CASE WHEN @SortBy = N'Priority'   AND @SortDir = 'desc' THEN [Priority]   END DESC,
        CASE WHEN @SortBy = N'Status'     AND @SortDir = 'asc'  THEN [Status]     END ASC,
        CASE WHEN @SortBy = N'Status'     AND @SortDir = 'desc' THEN [Status]     END DESC,
        CASE WHEN @SortBy = N'StartDate'  AND @SortDir = 'asc'  THEN [StartDate]  END ASC,
        CASE WHEN @SortBy = N'StartDate'  AND @SortDir = 'desc' THEN [StartDate]  END DESC,
        CASE WHEN @SortBy = N'SortKey'    AND @SortDir = 'asc'  THEN [SortKey]    END ASC,
        CASE WHEN @SortBy = N'SortKey'    AND @SortDir = 'desc' THEN [SortKey]    END DESC,
        TodoItemId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
