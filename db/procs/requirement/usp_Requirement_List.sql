-- usp_Requirement_List — the project's requirement register, paged per ADR-0016 (ADR-0037).
-- Search column: Requirement. Sort whitelist: Ref (default: catalog type order, then Number),
--   Requirement, CreatedAtUtc. An unknown @SortBy falls back to the default.
-- Paged in a CTE first; the links JSON is built for the page's rows only.
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
        SELECT RequirementId,
               COUNT(*) OVER () AS TotalCount,
               ROW_NUMBER() OVER (
                   ORDER BY
                       CASE WHEN @SortBy = N'Requirement' AND @SortDir = 'asc'
                            THEN Requirement END ASC,
                       CASE WHEN @SortBy = N'Requirement' AND @SortDir = 'desc'
                            THEN Requirement END DESC,
                       CASE WHEN @SortBy = N'CreatedAtUtc' AND @SortDir = 'asc'
                            THEN CreatedAtUtc END ASC,
                       CASE WHEN @SortBy = N'CreatedAtUtc' AND @SortDir = 'desc'
                            THEN CreatedAtUtc END DESC,
                       CASE WHEN @SortDir = 'desc'
                                 AND (@SortBy IS NULL OR @SortBy NOT IN (N'Requirement', N'CreatedAtUtc'))
                            THEN CASE RequirementType
                                     WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                                     WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END END DESC,
                       CASE WHEN @SortDir = 'desc'
                                 AND (@SortBy IS NULL OR @SortBy NOT IN (N'Requirement', N'CreatedAtUtc'))
                            THEN Number END DESC,
                       CASE RequirementType
                           WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                           WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END ASC,
                       Number ASC
               ) AS RowNum
        FROM app.Requirement
        WHERE ProjectId = @ProjectId
          AND IsDeleted = 0
          AND (@Type IS NULL OR RequirementType = @Type)
          AND (@Search IS NULL OR Requirement LIKE N'%' + @Search + N'%' ESCAPE N'\')
    )
    SELECT r.RequirementId,
           r.ProjectId,
           r.RequirementType,
           r.Number,
           r.Requirement,
           r.IsMet,
           r.CreatedAtUtc,
           r.UpdatedAtUtc,
           CAST(r.RowVer AS BIGINT) AS RowVer,
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
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, r.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, r.ProjectId, N'requirements') ov
    WHERE p.RowNum > (@Page - 1) * @PageSize
      AND p.RowNum <= @Page * @PageSize
    ORDER BY p.RowNum;
END;
GO
