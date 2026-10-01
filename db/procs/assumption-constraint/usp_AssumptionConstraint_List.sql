-- usp_AssumptionConstraint_List — paged/filtered list per ADR-0016. Search columns: Description, Type. Sort whitelist: Type, Impact.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_List
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

    SELECT AssumptionConstraintId,
           [ProjectId],
           [Type],
           [Description],
           [IsValidated],
           [Impact],
           [MitigationPlan],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.AssumptionConstraint
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [Description] LIKE N'%' + @Search + N'%'
           OR [Type] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'Type' AND @SortDir = 'asc'  THEN [Type] END ASC,
        CASE WHEN @SortBy = N'Type' AND @SortDir = 'desc' THEN [Type] END DESC,
        CASE WHEN @SortBy = N'Impact' AND @SortDir = 'asc'  THEN [Impact] END ASC,
        CASE WHEN @SortBy = N'Impact' AND @SortDir = 'desc' THEN [Impact] END DESC,
        AssumptionConstraintId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
