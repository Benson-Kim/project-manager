-- usp_Stakeholder_List — paged/filtered list per ADR-0016. Search columns: FirstName, LastName, DepartmentOrganization, EmailAddress. Sort whitelist: LastName, FirstName, ProjectRole, EngagementLevel.
-- Entity app.Stakeholder (source: tblStakeholders). Module: database-schema-and-procs (#3); search/sort extended per issue #6.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @EngagementLevel NVARCHAR(255) = NULL,
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

    SELECT StakeholderId,
           [ProjectId],
           [FirstName],
           [LastName],
           [DepartmentOrganization],
           [ProjectRole],
           [RoleDescription],
           [PhoneNumber],
           [PhoneExt],
           [Mobile],
           [EmailAddress],
           [PhysicalLocation],
           [OrgTitle],
           [CommunicationPreference],
           [EngagementLevel],
           [AdditionalNotes],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.Stakeholder
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@EngagementLevel IS NULL OR [EngagementLevel] = @EngagementLevel)
      AND (@Search IS NULL OR [FirstName] LIKE N'%' + @Search + N'%'
           OR [LastName] LIKE N'%' + @Search + N'%'
           OR [DepartmentOrganization] LIKE N'%' + @Search + N'%'
           OR [EmailAddress] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'LastName' AND @SortDir = 'asc'  THEN [LastName] END ASC,
        CASE WHEN @SortBy = N'LastName' AND @SortDir = 'desc' THEN [LastName] END DESC,
        CASE WHEN @SortBy = N'FirstName' AND @SortDir = 'asc'  THEN [FirstName] END ASC,
        CASE WHEN @SortBy = N'FirstName' AND @SortDir = 'desc' THEN [FirstName] END DESC,
        CASE WHEN @SortBy = N'ProjectRole' AND @SortDir = 'asc'  THEN [ProjectRole] END ASC,
        CASE WHEN @SortBy = N'ProjectRole' AND @SortDir = 'desc' THEN [ProjectRole] END DESC,
        CASE WHEN @SortBy = N'EngagementLevel' AND @SortDir = 'asc'  THEN [EngagementLevel] END ASC,
        CASE WHEN @SortBy = N'EngagementLevel' AND @SortDir = 'desc' THEN [EngagementLevel] END DESC,
        StakeholderId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
