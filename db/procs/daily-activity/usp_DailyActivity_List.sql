-- usp_DailyActivity_List — paged/filtered list per ADR-0016. Search columns: Task, Requester, MyActivity.
-- Filter params: @ActivityStatusId (exact match), @TaskType (exact match).
-- Sort whitelist: RequestDate, ActivityDate, Status, CompleteDate.
-- Entity app.DailyActivity (source: tblDailyActivityList). Module: daily-activities (#19).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_List
    @ActorUserId      INT,
    @ProjectId        INT           = NULL,
    @Search           NVARCHAR(100) = NULL,
    @SortBy           NVARCHAR(50)  = NULL,
    @SortDir          VARCHAR(4)    = 'asc',
    @Page             INT           = 1,
    @PageSize         INT           = 25,
    @ActivityStatusId INT           = NULL,
    @TaskType         NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT DailyActivityId,
           [ProjectId],
           [ActivityStatusId],
           [Requester],
           [Task],
           [MyActivity],
           [ActivityDate],
           [Comments],
           [RequestDate],
           [Status],
           [CompleteDate],
           [ContactMethod],
           [TimeSpent],
           [AssignedTo],
           [TaskType],
           [Progress],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.DailyActivity
    WHERE IsDeleted = 0
      AND (@ProjectId        IS NULL OR ProjectId        = @ProjectId)
      AND (@ActivityStatusId IS NULL OR ActivityStatusId = @ActivityStatusId)
      AND (@TaskType         IS NULL OR [TaskType]       = @TaskType)
      AND (@Search IS NULL
           OR [Task]       LIKE N'%' + @Search + N'%'
           OR [Requester]  LIKE N'%' + @Search + N'%'
           OR [MyActivity] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'RequestDate'  AND @SortDir = 'asc'  THEN [RequestDate]  END ASC,
        CASE WHEN @SortBy = N'RequestDate'  AND @SortDir = 'desc' THEN [RequestDate]  END DESC,
        CASE WHEN @SortBy = N'ActivityDate' AND @SortDir = 'asc'  THEN [ActivityDate] END ASC,
        CASE WHEN @SortBy = N'ActivityDate' AND @SortDir = 'desc' THEN [ActivityDate] END DESC,
        CASE WHEN @SortBy = N'Status'       AND @SortDir = 'asc'  THEN [Status]       END ASC,
        CASE WHEN @SortBy = N'Status'       AND @SortDir = 'desc' THEN [Status]       END DESC,
        CASE WHEN @SortBy = N'CompleteDate' AND @SortDir = 'asc'  THEN [CompleteDate] END ASC,
        CASE WHEN @SortBy = N'CompleteDate' AND @SortDir = 'desc' THEN [CompleteDate] END DESC,
        DailyActivityId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
