-- usp_FinancialDocument_List — paged/filtered list per ADR-0016. Search columns: (none). Sort whitelist: (default FinancialDocumentId only).
-- Entity app.FinancialDocument (source: tblProjectFinancialDocuments). Module: database-schema-and-procs (#3).

-- @ProjectId is accepted for contract uniformity but ignored (entity is not project-scoped).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @FinancialId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT FinancialDocumentId,
           [FinancialId],
           [FinancialDocumentTypeId],
           [IsRequired],
           [ReasonNotCreated],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.FinancialDocument
    WHERE IsDeleted = 0
      AND (@FinancialId IS NULL OR [FinancialId] = @FinancialId)
    ORDER BY
        FinancialDocumentId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
