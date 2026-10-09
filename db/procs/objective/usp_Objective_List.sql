-- usp_Objective_List — paged/filtered list per ADR-0016. Search columns: ObjectiveText. Sort whitelist: (default ObjectiveId only).
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor is assigned to (Admin sees all). LIKE wildcards in @Search are escaped.
-- ActorAccess (ADR-0023): the actor's access level on each row's project (dbo.ufn_AccessLevel_Resolve);
--   the datasheet uses it to decide per row whether cells are editable. The cross-project filter
--   reads the same rule: a row is listed when the actor has a level on it.
-- Entity app.Objective (source: tblProjectObjectives). Module: database-schema-and-procs (#3).
-- ActorGrants / ActorRevokes (ADR-0024): the actor's per-person overrides of 'objectives' in the
--   row's project (dbo.ufn_Permission_Overrides), so the datasheet gates cells as the procs do.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Objective_List
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

    SELECT ObjectiveId,
           [ProjectId],
           [QMeasurable],
           [QSuccess],
           [QAlignmentStrategy],
           [ObjectiveText],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.Objective
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, Objective.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, Objective.ProjectId, N'objectives') ov
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Search IS NULL OR [ObjectiveText] LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY
        ObjectiveId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
