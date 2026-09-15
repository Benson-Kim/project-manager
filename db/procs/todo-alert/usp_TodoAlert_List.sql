-- usp_TodoAlert_List — paged/filtered list per ADR-0016. Search columns: (none). Sort whitelist: AlertDay.
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

    SELECT TodoAlertId,
           [TodoItemId],
           [AlertDay],
           [AlertTime],
           [RepeatUnit],
           [RepeatInterval],
           [CurrentRepeatInterval],
           [SnoozeCount],
           [LastSnoozeTime],
           [MaxSnoozeCount],
           [SnoozeOptions],
           [IsDismissed],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.TodoAlert
    WHERE IsDeleted = 0
      AND (@TodoItemId IS NULL OR [TodoItemId] = @TodoItemId)
    ORDER BY
        CASE WHEN @SortBy = N'AlertDay' AND @SortDir = 'asc'  THEN [AlertDay] END ASC,
        CASE WHEN @SortBy = N'AlertDay' AND @SortDir = 'desc' THEN [AlertDay] END DESC,
        TodoAlertId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
