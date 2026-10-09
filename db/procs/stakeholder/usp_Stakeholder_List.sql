-- usp_Stakeholder_List — paged/filtered list per ADR-0016. Search columns: FirstName, LastName, DepartmentOrganization, EmailAddress. Sort whitelist: LastName, FirstName, ProjectRole, EngagementLevel.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor is assigned to (Admin sees all). LIKE wildcards in @Search are escaped.
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
      AND (@ProjectId IS NOT NULL OR ISNULL(@ActorRole, N'') = N'Admin'
           OR EXISTS (SELECT 1 FROM app.ProjectAssignee pa
                      WHERE pa.ProjectId = Stakeholder.ProjectId AND pa.UserId = @ActorUserId AND pa.IsDeleted = 0))
      AND (@EngagementLevel IS NULL OR [EngagementLevel] = @EngagementLevel)
      AND (@Search IS NULL OR [FirstName] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR [LastName] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR [DepartmentOrganization] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR [EmailAddress] LIKE N'%' + @Search + N'%' ESCAPE N'\')
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
