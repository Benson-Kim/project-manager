-- usp_DailyActivity_List — paged/filtered list per ADR-0016. Search columns: Task, Requester, MyActivity.
-- Filter params: @ActivityStatusId (exact match), @TaskType (exact match).
-- Sort whitelist: RequestDate, ActivityDate, Status, CompleteDate.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only the rows the actor has
--   an access level on (dbo.ufn_AccessLevel_Resolve: assigned projects plus project-less rows; Admin
--   sees all). LIKE wildcards in @Search are escaped.
-- Extra columns for the datasheet (ADR-0023): ActivityStatus (the status option's label, live or
--   retired) and ActorAccess (the actor's level on the row's project, which decides per row whether
--   its cells are editable on cross-project pages).
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

    SELECT da.DailyActivityId,
           da.[ProjectId],
           da.[ActivityStatusId],
           st.Label AS ActivityStatus,
           da.[Requester],
           da.[Task],
           da.[MyActivity],
           da.[ActivityDate],
           da.[Comments],
           da.[RequestDate],
           da.[Status],
           da.[CompleteDate],
           da.[ContactMethod],
           da.[TimeSpent],
           da.[AssignedTo],
           da.[TaskType],
           da.[Progress],
           da.CreatedAtUtc,
           da.UpdatedAtUtc,
           CAST(da.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           TotalCount = COUNT(*) OVER ()
    FROM app.DailyActivity da
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, da.ProjectId, 1) acc
    LEFT JOIN app.LookupOption st ON st.LookupOptionId = da.ActivityStatusId
    WHERE da.IsDeleted = 0
      AND (@ProjectId IS NULL OR da.ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@ActivityStatusId IS NULL OR da.ActivityStatusId = @ActivityStatusId)
      AND (@TaskType         IS NULL OR da.[TaskType]       = @TaskType)
      AND (@Search IS NULL
           OR da.[Task]       LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR da.[Requester]  LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR da.[MyActivity] LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY
        CASE WHEN @SortBy = N'RequestDate'  AND @SortDir = 'asc'  THEN da.[RequestDate]  END ASC,
        CASE WHEN @SortBy = N'RequestDate'  AND @SortDir = 'desc' THEN da.[RequestDate]  END DESC,
        CASE WHEN @SortBy = N'ActivityDate' AND @SortDir = 'asc'  THEN da.[ActivityDate] END ASC,
        CASE WHEN @SortBy = N'ActivityDate' AND @SortDir = 'desc' THEN da.[ActivityDate] END DESC,
        CASE WHEN @SortBy = N'Status'       AND @SortDir = 'asc'  THEN da.[Status]       END ASC,
        CASE WHEN @SortBy = N'Status'       AND @SortDir = 'desc' THEN da.[Status]       END DESC,
        CASE WHEN @SortBy = N'CompleteDate' AND @SortDir = 'asc'  THEN da.[CompleteDate] END ASC,
        CASE WHEN @SortBy = N'CompleteDate' AND @SortDir = 'desc' THEN da.[CompleteDate] END DESC,
        da.DailyActivityId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
