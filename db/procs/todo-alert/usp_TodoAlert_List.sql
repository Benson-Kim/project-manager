-- usp_TodoAlert_List — paged/filtered list per ADR-0016. Search columns: (none). Sort whitelist: AlertDay.
-- Actor scope: only alerts whose parent TodoItem.CreatedBy = @ActorUserId are returned (Admin/PM see all).
-- Entity app.TodoAlert (source: tblTodoList (alert engine columns, 1:1)). Module: database-schema-and-procs (#3).

-- @ProjectId is accepted for contract uniformity but ignored (entity is not project-scoped).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @TodoItemId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT a.TodoAlertId,
           a.[TodoItemId],
           a.[AlertDay],
           a.[AlertTime],
           a.[RepeatUnit],
           a.[RepeatInterval],
           a.[CurrentRepeatInterval],
           a.[SnoozeCount],
           a.[LastSnoozeTime],
           a.[MaxSnoozeCount],
           a.[SnoozeOptions],
           a.[IsDismissed],
           a.CreatedAtUtc,
           a.UpdatedAtUtc,
           CAST(a.RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.TodoAlert AS a
    INNER JOIN app.TodoItem AS t
        ON t.TodoItemId = a.TodoItemId AND t.IsDeleted = 0
    WHERE a.IsDeleted = 0
      AND (@TodoItemId IS NULL OR a.[TodoItemId] = @TodoItemId)
      AND (
              t.CreatedBy = @ActorUserId
              OR EXISTS (
                  SELECT 1 FROM auth.[User] u
                  WHERE  u.UserId = @ActorUserId
                    AND  u.RoleId IN (
                             SELECT RoleId FROM auth.[Role]
                             WHERE  Name IN (N'Admin', N'ProjectManager')
                         )
              )
          )
    ORDER BY
        CASE WHEN @SortBy = N'AlertDay' AND @SortDir = 'asc'  THEN a.[AlertDay] END ASC,
        CASE WHEN @SortBy = N'AlertDay' AND @SortDir = 'desc' THEN a.[AlertDay] END DESC,
        a.TodoAlertId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
