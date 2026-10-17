-- usp_Note_List — paged/filtered notebooks per ADR-0016 (ADR-0035).
-- TabCount: live pages. LastEditedAtUtc: the latest change to the notebook or any live page.
-- Search: the notebook title, page titles and page SearchText (plain text; never the HTML).
--   LIKE wildcards in @Search are escaped.
-- Sort whitelist: Title, TabCount, LastEditedAtUtc. NoteId is the final tiebreaker.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor has a level on (Admin sees all).
-- ActorAccess / ActorGrants / ActorRevokes (ADR-0023, ADR-0024) as in the other list procs.
-- Entity app.Note (source: tblNotes). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_List
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

    SELECT n.NoteId,
           n.[ProjectId],
           n.[Title],
           n.CreatedAtUtc,
           n.UpdatedAtUtc,
           CAST(n.RowVer AS BIGINT) AS RowVer,
           tabs.TabCount,
           e.LastEditedAtUtc,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.Note AS n
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, n.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, n.ProjectId, N'notes') ov
    CROSS APPLY (SELECT COUNT(*) AS TabCount,
                        MAX(COALESCE(t.UpdatedAtUtc, t.CreatedAtUtc)) AS TabEditedAtUtc
                 FROM app.NoteTab AS t
                 WHERE t.NoteId = n.NoteId AND t.IsDeleted = 0) tabs
    CROSS APPLY (SELECT CASE WHEN tabs.TabEditedAtUtc > COALESCE(n.UpdatedAtUtc, n.CreatedAtUtc)
                             THEN tabs.TabEditedAtUtc
                             ELSE COALESCE(n.UpdatedAtUtc, n.CreatedAtUtc) END AS LastEditedAtUtc) e
    WHERE n.IsDeleted = 0
      AND (@ProjectId IS NULL OR n.ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Search IS NULL
           OR n.[Title] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR EXISTS (SELECT 1 FROM app.NoteTab AS s
                      WHERE s.NoteId = n.NoteId AND s.IsDeleted = 0
                        AND (s.[Title] LIKE N'%' + @Search + N'%' ESCAPE N'\'
                             OR s.[SearchText] LIKE N'%' + @Search + N'%' ESCAPE N'\')))
    ORDER BY
        CASE WHEN @SortBy = N'Title'           AND @SortDir = 'asc'  THEN n.[Title] END ASC,
        CASE WHEN @SortBy = N'Title'           AND @SortDir = 'desc' THEN n.[Title] END DESC,
        CASE WHEN @SortBy = N'TabCount'        AND @SortDir = 'asc'  THEN tabs.TabCount END ASC,
        CASE WHEN @SortBy = N'TabCount'        AND @SortDir = 'desc' THEN tabs.TabCount END DESC,
        CASE WHEN @SortBy = N'LastEditedAtUtc' AND @SortDir = 'asc'  THEN e.LastEditedAtUtc END ASC,
        CASE WHEN @SortBy = N'LastEditedAtUtc' AND @SortDir = 'desc' THEN e.LastEditedAtUtc END DESC,
        n.[Title] ASC,
        n.NoteId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
