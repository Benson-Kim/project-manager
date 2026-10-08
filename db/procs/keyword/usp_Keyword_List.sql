-- usp_Keyword_List — paged/filtered list per ADR-0016. Search columns: Keyword, Definition. Sort whitelist: Keyword.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor is assigned to plus project-less rows (Admin sees all). LIKE wildcards in @Search are escaped.
-- ActorAccess (ADR-0023): the actor's access level on each row's project (dbo.ufn_AccessLevel_Resolve);
--   the datasheet uses it to decide per row whether cells are editable. The cross-project filter
--   reads the same rule: a row is listed when the actor has a level on it.
-- Entity app.Keyword (source: tblKeywords). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_List
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

    SELECT KeywordId,
           [ProjectId],
           [Keyword],
           [Definition],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           TotalCount = COUNT(*) OVER ()
    FROM app.Keyword
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, Keyword.ProjectId, 1) acc
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Search IS NULL OR [Keyword] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR [Definition] LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY
        CASE WHEN @SortBy = N'Keyword' AND @SortDir = 'asc'  THEN [Keyword] END ASC,
        CASE WHEN @SortBy = N'Keyword' AND @SortDir = 'desc' THEN [Keyword] END DESC,
        KeywordId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
