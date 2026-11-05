-- usp_Decision_List — paged/filtered list per ADR-0016. Search columns: Title, Status, and the
--   reference as the app shows it (DEC-004, messages.decisions.ref).
--   Sort whitelist: DecisionNumber, Title, DateLogged, Status.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor is assigned to (Admin sees all). LIKE wildcards in @Search are escaped.
-- ActorAccess (ADR-0023): the actor's access level on each row's project (dbo.ufn_AccessLevel_Resolve);
--   the datasheet uses it to decide per row whether cells are editable. The cross-project filter
--   reads the same rule: a row is listed when the actor has a level on it.
-- ActorGrants / ActorRevokes (ADR-0024): the actor's per-person overrides of 'decisions' in the
--   row's project (dbo.ufn_Permission_Overrides), so the datasheet gates cells as the procs do.
-- @ImpactedArea answers "which decisions touched Budget" off IX_DecisionImpactedArea_Project_Label.
-- Entity app.Decision (migration 057). Module: decisions (ADR-0055, BL36).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Decision_List
    @ActorUserId   INT,
    @ProjectId     INT           = NULL,
    @Search        NVARCHAR(100) = NULL,
    @SortBy        NVARCHAR(50)  = NULL,
    @SortDir       VARCHAR(4)    = 'asc',
    @Page          INT           = 1,
    @PageSize      INT           = 25,
    @Status        NVARCHAR(50)  = NULL,
    @ImpactedArea  NVARCHAR(50)  = NULL
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

    SELECT d.DecisionId,
           d.[ProjectId],
           d.DecisionNumber,
           d.[Title],
           d.[DateLogged],
           d.[OwnerStakeholderId],
           d.[Status],
           d.[ProblemContext],
           d.[OptionsConsidered],
           d.[Rationale],
           d.[NextSteps],
           d.[SupersededByDecisionId],
           (SELECT a.Label AS label FROM app.DecisionImpactedArea AS a
            WHERE a.DecisionId = d.DecisionId ORDER BY a.Label
            FOR JSON PATH) AS ImpactedAreas,
           (SELECT s.StakeholderId AS id FROM app.DecisionStakeholder AS s
            WHERE s.DecisionId = d.DecisionId ORDER BY s.StakeholderId
            FOR JSON PATH) AS ConsultedStakeholderIds,
           d.CreatedAtUtc,
           d.UpdatedAtUtc,
           CAST(d.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.Decision d
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, d.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, d.ProjectId, N'decisions') ov
    WHERE d.IsDeleted = 0
      AND (@ProjectId IS NULL OR d.ProjectId = @ProjectId)
      AND (@Status IS NULL OR d.[Status] = @Status)
      AND (@ImpactedArea IS NULL
           OR EXISTS (SELECT 1 FROM app.DecisionImpactedArea AS f
                      WHERE f.DecisionId = d.DecisionId AND f.Label = @ImpactedArea))
      AND (@Search IS NULL OR d.[Title] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR d.[Status] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR N'DEC-' + CASE WHEN d.DecisionNumber < 100
                             THEN RIGHT(N'00' + CAST(d.DecisionNumber AS NVARCHAR(10)), 3)
                             ELSE CAST(d.DecisionNumber AS NVARCHAR(10)) END
              LIKE N'%' + @Search + N'%' ESCAPE N'\')
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
    ORDER BY
        CASE WHEN @SortBy = N'DecisionNumber' AND @SortDir = 'asc'  THEN DecisionNumber END ASC,
        CASE WHEN @SortBy = N'DecisionNumber' AND @SortDir = 'desc' THEN DecisionNumber END DESC,
        CASE WHEN @SortBy = N'Title' AND @SortDir = 'asc'  THEN [Title] END ASC,
        CASE WHEN @SortBy = N'Title' AND @SortDir = 'desc' THEN [Title] END DESC,
        CASE WHEN @SortBy = N'DateLogged' AND @SortDir = 'asc'  THEN [DateLogged] END ASC,
        CASE WHEN @SortBy = N'DateLogged' AND @SortDir = 'desc' THEN [DateLogged] END DESC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'asc'  THEN [Status] END ASC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'desc' THEN [Status] END DESC,
        d.[DateLogged] DESC,
        DecisionId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
