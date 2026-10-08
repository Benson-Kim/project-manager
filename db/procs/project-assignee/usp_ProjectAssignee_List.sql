-- usp_ProjectAssignee_List — paged/filtered list per ADR-0016. Search columns: PersonName. Sort whitelist: PersonName, Role.
-- Row-level access: a supplied @ProjectId must be readable (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads return only teams of projects the actor is on
--   (Admin sees all). LIKE wildcards in @Search are escaped. Returns each row's AccessLevel.
-- Entity app.ProjectAssignee (source: (new — req 0.3 one-or-many PMs/sponsors/BAs)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectAssignee_List
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

    SELECT ProjectAssigneeId,
           [ProjectId],
           [Role],
           [PersonName],
           [UserId],
           pa.[AccessLevel],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.ProjectAssignee pa
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, pa.ProjectId, 0) acc
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Search IS NULL OR [PersonName] LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY
        CASE WHEN @SortBy = N'PersonName' AND @SortDir = 'asc'  THEN [PersonName] END ASC,
        CASE WHEN @SortBy = N'PersonName' AND @SortDir = 'desc' THEN [PersonName] END DESC,
        CASE WHEN @SortBy = N'Role' AND @SortDir = 'asc'  THEN [Role] END ASC,
        CASE WHEN @SortBy = N'Role' AND @SortDir = 'desc' THEN [Role] END DESC,
        ProjectAssigneeId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
