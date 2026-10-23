-- usp_Board_List — paged/filtered list per ADR-0016. Search columns: Name, Description.
-- Filter params: @ProjectId (one project's boards), @WithoutProject (1 = only standalone boards;
--   the cross-project page's "No project" filter).
-- Sort whitelist: Name, ProjectName, UpdatedAtUtc, with BoardId as the tiebreak.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only the boards the actor has
--   a level on (dbo.ufn_Board_AccessLevel: assigned projects plus every standalone board; Admin sees
--   all). A board whose project was deleted is hidden, as dbo.usp_Board_AssertAccess hides it.
--   LIKE wildcards in @Search are escaped (docs/STANDARDS.md 2.3).
-- ActorAccess / ActorGrants / ActorRevokes (ADR-0016, ADR-0024): the actor's level on the row and
--   their per-person overrides of 'boards' in the row's project, so the list gates each row's
--   actions exactly as the write procs will. A standalone board never carries overrides.
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_List
    @ActorUserId    INT,
    @ProjectId      INT           = NULL,
    @Search         NVARCHAR(100) = NULL,
    @SortBy         NVARCHAR(50)  = NULL,
    @SortDir        VARCHAR(4)    = 'asc',
    @Page           INT           = 1,
    @PageSize       INT           = 25,
    @WithoutProject BIT           = 0
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

    SELECT b.BoardId,
           b.ProjectId,
           p.ProjectName,
           b.[Name],
           b.[Description],
           b.CreatedBy,
           b.CreatedAtUtc,
           b.UpdatedAtUtc,
           CAST(b.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.Board b
    CROSS APPLY dbo.ufn_Board_AccessLevel(@ActorRole, @ActorUserId, b.ProjectId, b.CreatedBy) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, b.ProjectId, N'boards') ov
    LEFT JOIN app.Project p ON p.ProjectId = b.ProjectId
    WHERE b.IsDeleted = 0
      AND (b.ProjectId IS NULL OR p.IsDeleted = 0)
      AND (@ProjectId IS NULL OR b.ProjectId = @ProjectId)
      AND (ISNULL(@WithoutProject, 0) = 0 OR b.ProjectId IS NULL)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Search IS NULL
           OR b.[Name]        LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR b.[Description] LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY
        CASE WHEN @SortBy = N'Name'        AND @SortDir = 'asc'  THEN b.[Name]        END ASC,
        CASE WHEN @SortBy = N'Name'        AND @SortDir = 'desc' THEN b.[Name]        END DESC,
        CASE WHEN @SortBy = N'ProjectName' AND @SortDir = 'asc'  THEN p.ProjectName   END ASC,
        CASE WHEN @SortBy = N'ProjectName' AND @SortDir = 'desc' THEN p.ProjectName   END DESC,
        CASE WHEN @SortBy = N'UpdatedAtUtc' AND @SortDir = 'asc'  THEN b.UpdatedAtUtc END ASC,
        CASE WHEN @SortBy = N'UpdatedAtUtc' AND @SortDir = 'desc' THEN b.UpdatedAtUtc END DESC,
        b.BoardId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
