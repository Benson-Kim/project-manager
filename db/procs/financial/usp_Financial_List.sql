-- usp_Financial_List - paged/filtered list per ADR-0016 (ADR-0029).
-- Search columns: Title, BudgetEnvelope, GlGrandLivre. Sort whitelist: Title, ProjectNumber,
-- BudgetEnvelope, Budget, FirstFiscalYear; default Title. LIKE wildcards in @Search are escaped.
-- Row-level access: a supplied @ProjectId needs Viewer (dbo.usp_Project_AssertAccess ->
-- FORBIDDEN_ROW 50003); cross-project reads list only rows the actor has a level on.
-- ActorAccess / ActorGrants / ActorRevokes (ADR-0023/0024) for the 'financials' section.
-- LineCount: live budget lines. FinancialId is the final tiebreaker for stable paging.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_List
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

    SELECT f.FinancialId,
           f.ProjectId,
           f.Title,
           f.TemplateName,
           f.ProjectNumber,
           f.BudgetEnvelope,
           CAST(f.Budget AS DECIMAL(19,2)) AS Budget,
           CAST(f.RecurrentFees AS DECIMAL(19,2)) AS RecurrentFees,
           f.ContractTimeframe,
           f.FirstFiscalYear,
           f.HorizonYears,
           f.FiscalYearStartMonth,
           (SELECT COUNT(*) FROM app.FinancialLine AS l
            WHERE l.FinancialId = f.FinancialId AND l.IsDeleted = 0) AS LineCount,
           f.CreatedAtUtc,
           f.UpdatedAtUtc,
           CAST(f.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.Financial AS f
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, f.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, f.ProjectId, N'financials') ov
    WHERE f.IsDeleted = 0
      AND (@ProjectId IS NULL OR f.ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Search IS NULL
           OR f.Title          LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR f.BudgetEnvelope LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR f.GlGrandLivre   LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY
        CASE WHEN @SortBy = N'ProjectNumber'   AND @SortDir = 'asc'  THEN f.ProjectNumber END ASC,
        CASE WHEN @SortBy = N'ProjectNumber'   AND @SortDir = 'desc' THEN f.ProjectNumber END DESC,
        CASE WHEN @SortBy = N'BudgetEnvelope'  AND @SortDir = 'asc'  THEN f.BudgetEnvelope END ASC,
        CASE WHEN @SortBy = N'BudgetEnvelope'  AND @SortDir = 'desc' THEN f.BudgetEnvelope END DESC,
        CASE WHEN @SortBy = N'Budget'          AND @SortDir = 'asc'  THEN f.Budget END ASC,
        CASE WHEN @SortBy = N'Budget'          AND @SortDir = 'desc' THEN f.Budget END DESC,
        CASE WHEN @SortBy = N'FirstFiscalYear' AND @SortDir = 'asc'  THEN f.FirstFiscalYear END ASC,
        CASE WHEN @SortBy = N'FirstFiscalYear' AND @SortDir = 'desc' THEN f.FirstFiscalYear END DESC,
        CASE WHEN @SortDir = 'desc' AND (@SortBy IS NULL OR @SortBy = N'Title') THEN f.Title END DESC,
        f.Title ASC,
        f.FinancialId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
