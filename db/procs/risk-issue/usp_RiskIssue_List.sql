-- usp_RiskIssue_List — paged/filtered list per ADR-0016. Search columns: Description, Category, Owner.
--   Sort whitelist: Category, DateIdentified, Status, Priority, DueDate.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor is assigned to (Admin sees all). LIKE wildcards in @Search are escaped.
-- ActorAccess (ADR-0023): the actor's access level on each row's project (dbo.ufn_AccessLevel_Resolve);
--   the datasheet uses it to decide per row whether cells are editable. The cross-project filter
--   reads the same rule: a row is listed when the actor has a level on it.
-- ActorGrants / ActorRevokes (ADR-0024): the actor's per-person overrides of 'risks-issues' in the
--   row's project (dbo.ufn_Permission_Overrides), so the datasheet gates cells as the procs do.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: risks-issues (#14, ADR-0050).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @Category    NVARCHAR(50)  = NULL,
    @Status      NVARCHAR(50)  = NULL
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
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

    SELECT ri.RiskIssueId,
           ri.[ProjectId],
           ri.[Description],
           ri.[Category],
           ri.[DateIdentified],
           ri.[Status],
           ri.[Priority],
           ri.[Impact],
           ri.[Probability],
           ri.[MitigationPlan],
           ri.[Owner],
           ri.[DueDate],
           ri.CreatedAtUtc,
           ri.UpdatedAtUtc,
           CAST(ri.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.RiskIssue ri
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, ri.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, ri.ProjectId, N'risks-issues') ov
    WHERE ri.IsDeleted = 0
      AND (@ProjectId IS NULL OR ri.ProjectId = @ProjectId)
      AND (@Category IS NULL OR ri.[Category] = @Category)
      AND (@Status IS NULL OR ri.[Status] = @Status)
      AND (@Search IS NULL OR ri.[Description] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR ri.[Category] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR ri.[Owner] LIKE N'%' + @Search + N'%' ESCAPE N'\')
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
    ORDER BY
        CASE WHEN @SortBy = N'Category' AND @SortDir = 'asc'  THEN [Category] END ASC,
        CASE WHEN @SortBy = N'Category' AND @SortDir = 'desc' THEN [Category] END DESC,
        CASE WHEN @SortBy = N'DateIdentified' AND @SortDir = 'asc'  THEN [DateIdentified] END ASC,
        CASE WHEN @SortBy = N'DateIdentified' AND @SortDir = 'desc' THEN [DateIdentified] END DESC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'asc'  THEN [Status] END ASC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'desc' THEN [Status] END DESC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'asc'  THEN [Priority] END ASC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'desc' THEN [Priority] END DESC,
        CASE WHEN @SortBy = N'DueDate' AND @SortDir = 'asc'  THEN [DueDate] END ASC,
        CASE WHEN @SortBy = N'DueDate' AND @SortDir = 'desc' THEN [DueDate] END DESC,
        RiskIssueId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
