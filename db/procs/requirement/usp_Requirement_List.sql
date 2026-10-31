-- usp_Requirement_List — the project's requirement register, paged per ADR-0016 (ADR-0037).
-- Search column: Requirement. Sort whitelist: Ref (default: catalog type order, then the tree
--   path), Requirement, CreatedAtUtc. An unknown @SortBy falls back to the default.
-- Ref, SortPath and Depth come from ufn_Requirement_AncestorPath (ADR-0048), inside the paging CTE
--   rather than beside it: the default order *is* the path, so it has to be known before the page
--   is cut, or a sub-requirement would land on a different page from its parent. Depth is sent so
--   the register indents by it instead of recomputing the tree in the browser.
-- ChildCount is the live sub-requirements directly under the row (ADR-0048). The register needs it
--   to stop offering what the procs would refuse — a type change or a delete on a row that still
--   has children — rather than letting the save fail and explaining afterwards (STANDARDS §5.6).
--   It seeks IX_Requirement_Parent, which migration 048 adds for exactly these lookups.
-- A @Type or @Search filter is applied to rows, not to branches: a sub-requirement that matches is
--   returned whether or not its parent did. Its Ref is the whole path, so the row still says where
--   it belongs even when the parent is not on the page.
-- Paged in a CTE first; the links JSON and the owner's name are built for the page's rows only.
-- Planning columns (ADR-0052) as usp_Requirement_GetById.
-- Row-level access: dbo.usp_Project_AssertAccess on @ProjectId (FORBIDDEN_ROW 50003).
-- ActorAccess / ActorGrants / ActorRevokes per ADR-0023 and ADR-0024, as usp_Objective_List.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_List
    @ActorUserId INT,
    @ProjectId   INT,
    @Type        VARCHAR(3)    = NULL,
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

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

    WITH page AS (
        SELECT r.RequirementId, ap.Ref, ap.SortPath, ap.Depth,
               COUNT(*) OVER () AS TotalCount,
               ROW_NUMBER() OVER (
                   ORDER BY
                       CASE WHEN @SortBy = N'Requirement' AND @SortDir = 'asc'
                            THEN r.Requirement END ASC,
                       CASE WHEN @SortBy = N'Requirement' AND @SortDir = 'desc'
                            THEN r.Requirement END DESC,
                       CASE WHEN @SortBy = N'CreatedAtUtc' AND @SortDir = 'asc'
                            THEN r.CreatedAtUtc END ASC,
                       CASE WHEN @SortBy = N'CreatedAtUtc' AND @SortDir = 'desc'
                            THEN r.CreatedAtUtc END DESC,
                       CASE WHEN @SortDir = 'desc'
                                 AND (@SortBy IS NULL OR @SortBy NOT IN (N'Requirement', N'CreatedAtUtc'))
                            THEN CASE r.RequirementType
                                     WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                                     WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END END DESC,
                       CASE WHEN @SortDir = 'desc'
                                 AND (@SortBy IS NULL OR @SortBy NOT IN (N'Requirement', N'CreatedAtUtc'))
                            THEN ap.SortPath END DESC,
                       CASE r.RequirementType
                           WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                           WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END ASC,
                       ap.SortPath ASC
               ) AS RowNum
        FROM app.Requirement AS r
        CROSS APPLY dbo.ufn_Requirement_AncestorPath(r.RequirementId) AS ap
        WHERE r.ProjectId = @ProjectId
          AND r.IsDeleted = 0
          AND (@Type IS NULL OR r.RequirementType = @Type)
          AND (@Search IS NULL OR r.Requirement LIKE N'%' + @Search + N'%' ESCAPE N'\')
    )
    SELECT r.RequirementId,
           r.ProjectId,
           r.RequirementType,
           r.Number,
           p.Ref,
           p.SortPath,
           p.Depth,
           r.Requirement,
           r.IsMet,
           r.CreatedAtUtc,
           r.UpdatedAtUtc,
           CAST(r.RowVer AS BIGINT) AS RowVer,
           (SELECT COUNT(*) FROM app.Requirement AS ch
            WHERE ch.ParentRequirementId = r.RequirementId AND ch.IsDeleted = 0) AS ChildCount,
           r.ParentRequirementId,
           r.[MoSCoW],
           r.AcceptanceCriteria,
           r.EstimateDays,
           r.OwnerStakeholderId,
           o.OwnerName,
           l.ValidatesJson,
           l.ValidatedByJson,
           l.DeliverablesJson,
           p.TotalCount,
           acc.AccessLevel AS ActorAccess,
           ov.Grants       AS ActorGrants,
           ov.Revokes      AS ActorRevokes
    FROM page AS p
    JOIN app.Requirement AS r ON r.RequirementId = p.RequirementId
    OUTER APPLY dbo.ufn_Requirement_Links(r.RequirementId) AS l
    OUTER APPLY (SELECT LTRIM(RTRIM(CONCAT(ISNULL(s.FirstName, N''), N' ', ISNULL(s.LastName, N'')))) AS OwnerName
                 FROM app.Stakeholder AS s
                 WHERE s.StakeholderId = r.OwnerStakeholderId AND s.IsDeleted = 0) AS o
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, r.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, r.ProjectId, N'requirements') ov
    WHERE p.RowNum > (@Page - 1) * @PageSize
      AND p.RowNum <= @Page * @PageSize
    ORDER BY p.RowNum;
END;
GO
