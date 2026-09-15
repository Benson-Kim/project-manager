-- usp_Financial_List — paged/filtered list per ADR-0016. Search columns: BudgetEnvelope, GlGrandLivre, Acquisition. Sort whitelist: ProjectNumber, Budget.
-- Entity app.Financial (source: tblFinancials). Module: database-schema-and-procs (#3).
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
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT FinancialId,
           [ProjectId],
           [ProjectNumber],
           [Acquisition],
           [GlGrandLivre],
           [BudgetEnvelope],
           [Budget],
           [SpendBy],
           [RecurrentFees],
           [ContractTimeframe],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.Financial
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [BudgetEnvelope] LIKE N'%' + @Search + N'%'
           OR [GlGrandLivre] LIKE N'%' + @Search + N'%'
           OR [Acquisition] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'ProjectNumber' AND @SortDir = 'asc'  THEN [ProjectNumber] END ASC,
        CASE WHEN @SortBy = N'ProjectNumber' AND @SortDir = 'desc' THEN [ProjectNumber] END DESC,
        CASE WHEN @SortBy = N'Budget' AND @SortDir = 'asc'  THEN [Budget] END ASC,
        CASE WHEN @SortBy = N'Budget' AND @SortDir = 'desc' THEN [Budget] END DESC,
        FinancialId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
