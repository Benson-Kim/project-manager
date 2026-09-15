-- usp_Project_List — paged/filtered list per ADR-0016. Search columns: ProjectName, ProjectManager, ProjectSponsor. Sort whitelist: ProjectName, DateOfProject, StartDate, EndDate.
-- Entity app.Project (source: tblProjectFramework). Module: database-schema-and-procs (#3).

-- @ProjectId is accepted for contract uniformity but ignored (entity is not project-scoped).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_List
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

    SELECT ProjectId,
           [ProjectName],
           [ProjectManager],
           [BusinessAnalyst],
           [ProjectDocs],
           [ProjectSponsor],
           [DateOfProject],
           [ProblemStatement],
           [CurrentState],
           [FutureState],
           [UserImpact],
           [Mandate],
           [ProjectStatusCom],
           [ExistBusMod],
           [A1],
           [DA],
           [DAS],
           [PurchaseOrder],
           [Requisition],
           [DO],
           [FinancingSource],
           [FinancingCost],
           [RecurrentCost],
           [PurchaseEquipment],
           [EquipmentNotes],
           [StartDate],
           [EndDate],
           [SimilarProject],
           [ProjectPriority],
           [EstimatedCompletionDate],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.Project
    WHERE IsDeleted = 0
      AND (@Search IS NULL OR [ProjectName] LIKE N'%' + @Search + N'%'
           OR [ProjectManager] LIKE N'%' + @Search + N'%'
           OR [ProjectSponsor] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'ProjectName' AND @SortDir = 'asc'  THEN [ProjectName] END ASC,
        CASE WHEN @SortBy = N'ProjectName' AND @SortDir = 'desc' THEN [ProjectName] END DESC,
        CASE WHEN @SortBy = N'DateOfProject' AND @SortDir = 'asc'  THEN [DateOfProject] END ASC,
        CASE WHEN @SortBy = N'DateOfProject' AND @SortDir = 'desc' THEN [DateOfProject] END DESC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'asc'  THEN [StartDate] END ASC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'desc' THEN [StartDate] END DESC,
        CASE WHEN @SortBy = N'EndDate' AND @SortDir = 'asc'  THEN [EndDate] END ASC,
        CASE WHEN @SortBy = N'EndDate' AND @SortDir = 'desc' THEN [EndDate] END DESC,
        ProjectId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
