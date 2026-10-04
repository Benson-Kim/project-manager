-- usp_AssumptionConstraint_List — paged/filtered list per ADR-0016. Search columns: Description, Type. Sort whitelist: Type, Impact.
-- Row-level access: results are scoped to projects @ActorUserId is assigned to (unless Admin).
-- Admin role bypass: @ActorRole = N'Admin' returns all projects.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: assumptions-constraints (#13).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @Type        NVARCHAR(50)  = NULL,
    @ActorRole   NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT ac.AssumptionConstraintId,
           ac.[ProjectId],
           ac.[Type],
           ac.[Description],
           ac.[IsValidated],
           ac.[Impact],
           ac.[MitigationPlan],
           ac.CreatedAtUtc,
           ac.UpdatedAtUtc,
           CAST(ac.RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.AssumptionConstraint ac
    WHERE ac.IsDeleted = 0
      AND (@ProjectId IS NULL OR ac.ProjectId = @ProjectId)
      AND (@Type IS NULL OR ac.[Type] = @Type)
      AND (@Search IS NULL OR ac.[Description] LIKE N'%' + @Search + N'%'
           OR ac.[Type] LIKE N'%' + @Search + N'%')
      -- Row-level access: restrict to projects the actor is assigned to, unless Admin.
      AND (ISNULL(@ActorRole, '') = N'Admin'
           OR EXISTS (
               SELECT 1 FROM app.ProjectAssignee pa
               WHERE pa.ProjectId = ac.ProjectId AND pa.UserId = @ActorUserId AND pa.IsDeleted = 0
           ))
    ORDER BY
        CASE WHEN @SortBy = N'Type' AND @SortDir = 'asc'  THEN [Type] END ASC,
        CASE WHEN @SortBy = N'Type' AND @SortDir = 'desc' THEN [Type] END DESC,
        CASE WHEN @SortBy = N'Impact' AND @SortDir = 'asc'  THEN [Impact] END ASC,
        CASE WHEN @SortBy = N'Impact' AND @SortDir = 'desc' THEN [Impact] END DESC,
        AssumptionConstraintId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
