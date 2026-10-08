-- usp_TodoItem_List — paged/filtered list per ADR-0016. Search columns: TodoItem. Sort whitelist: DueDate, Priority, Status, StartDate.
-- Filter params: @Status (exact match), @Priority (exact match), @ProjectOrActivity (exact match).
-- Row-level access: a supplied @ProjectId must be readable (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); rows follow the to-do rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
--   LIKE wildcards in @Search are escaped.
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

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_');

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
      AND (@Search            IS NULL OR [TodoItem] LIKE N'%' + @Search + N'%' ESCAPE N'\')
      AND (@Status            IS NULL OR [Status]           = @Status)
      AND (@Priority          IS NULL OR [Priority]         = @Priority)
      AND (@ProjectOrActivity IS NULL OR [ProjectOrActivity] = @ProjectOrActivity)
      -- Visibility = dbo.usp_TodoItem_AssertAccess as a set (ADR-0021): Admin sees all; otherwise
      -- your own to-dos outside any project or in projects you are assigned to, plus every
      -- to-do of the projects you manage.
      AND (ISNULL(@ActorRole, N'') = N'Admin'
           OR (TodoItem.CreatedBy = @ActorUserId
               AND (TodoItem.ProjectId IS NULL
                    OR EXISTS (SELECT 1 FROM app.ProjectAssignee pa
                               WHERE pa.ProjectId = TodoItem.ProjectId AND pa.UserId = @ActorUserId
                                 AND pa.IsDeleted = 0)))
           OR EXISTS (SELECT 1 FROM app.ProjectAssignee pa
                      WHERE pa.ProjectId = TodoItem.ProjectId AND pa.UserId = @ActorUserId
                        AND pa.AccessLevel = N'Manager' AND pa.IsDeleted = 0))
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
