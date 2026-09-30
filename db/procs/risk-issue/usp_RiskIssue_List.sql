-- usp_RiskIssue_List — paged/filtered list per ADR-0016. Search columns: Description, Category, Owner. Sort whitelist: DateIdentified, Status, Priority, DueDate.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_List
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

    SELECT RiskIssueId,
           [ProjectId],
           [Description],
           [Category],
           [DateIdentified],
           [Status],
           [Priority],
           [Impact],
           [Probability],
           [MitigationPlan],
           [Owner],
           [DueDate],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.RiskIssue
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [Description] LIKE N'%' + @Search + N'%'
           OR [Category] LIKE N'%' + @Search + N'%'
           OR [Owner] LIKE N'%' + @Search + N'%')
    ORDER BY
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
