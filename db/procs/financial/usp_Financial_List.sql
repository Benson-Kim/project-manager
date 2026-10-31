-- usp_Financial_List - paged/filtered list per ADR-0016 (ADR-0029).
-- Search columns: Title, BudgetEnvelope, GlGrandLivre. Sort whitelist: Title, ProjectNumber,
-- BudgetEnvelope, Budget, FirstFiscalYear; default Title. LIKE wildcards in @Search are escaped.
-- Row-level access: a supplied @ProjectId needs Viewer (dbo.usp_Project_AssertAccess ->
-- FORBIDDEN_ROW 50003); cross-project reads list only rows the actor has a level on.
-- ActorAccess / ActorGrants / ActorRevokes (ADR-0023/0024) for the 'financials' section.
-- LineCount: live budget lines. Document counts (ADR-0030): DocumentCount live checklist rows,
-- DocumentsRequired / DocumentsNotRequired / DocumentsUndecided by their required flag, and
-- DocumentsRequiredWithFile the required ones holding at least one live attachment.
-- FinancialId is the final tiebreaker for stable paging.
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
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

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
           f.CurrencyCode,
           (SELECT COUNT(*) FROM app.FinancialLine AS l
            WHERE l.FinancialId = f.FinancialId AND l.IsDeleted = 0) AS LineCount,
           ISNULL(doc.DocumentCount, 0) AS DocumentCount,
           ISNULL(doc.DocumentsRequired, 0) AS DocumentsRequired,
           ISNULL(doc.DocumentsNotRequired, 0) AS DocumentsNotRequired,
           ISNULL(doc.DocumentsUndecided, 0) AS DocumentsUndecided,
           ISNULL(doc.DocumentsRequiredWithFile, 0) AS DocumentsRequiredWithFile,
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
    OUTER APPLY (
        SELECT COUNT(*) AS DocumentCount,
               SUM(CASE WHEN d.IsRequired = 1 THEN 1 ELSE 0 END) AS DocumentsRequired,
               SUM(CASE WHEN d.IsRequired = 0 THEN 1 ELSE 0 END) AS DocumentsNotRequired,
               SUM(CASE WHEN d.IsRequired IS NULL THEN 1 ELSE 0 END) AS DocumentsUndecided,
               SUM(CASE WHEN d.IsRequired = 1 AND hf.HasFile = 1 THEN 1 ELSE 0 END) AS DocumentsRequiredWithFile
        FROM app.FinancialDocument AS d
        OUTER APPLY (SELECT TOP (1) 1 AS HasFile
                     FROM app.FinancialDocumentFile AS l
                     JOIN app.FileAttachment AS a ON a.FileAttachmentId = l.FileAttachmentId
                     WHERE l.FinancialDocumentId = d.FinancialDocumentId AND a.IsDeleted = 0) hf
        WHERE d.FinancialId = f.FinancialId AND d.IsDeleted = 0
    ) doc
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
