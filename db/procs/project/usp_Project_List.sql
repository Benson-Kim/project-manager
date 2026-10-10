-- usp_Project_List — paged/filtered list per ADR-0016. Search columns: ProjectName, ProjectManager, ProjectSponsor, Mandate. Sort whitelist: ProjectName, DateOfProject, StartDate, EndDate, ProjectStatus, ProjectPriority, ProjectManager. Filters: @Status, @Priority.
-- Row-level access (ADR-0021): non-Admins see only the projects they are assigned to.
--   LIKE wildcards in @Search are escaped.
-- ActorAccess (ADR-0023): the actor's access level on each row's project (dbo.ufn_AccessLevel_Resolve);
--   the datasheet uses it to decide per row whether cells are editable. The cross-project filter
--   reads the same rule: a row is listed when the actor has a level on it.
-- Entity app.Project (source: tblProjectFramework). Module: database-schema-and-procs (#3); extended by projects (#5).

-- @ProjectId is accepted for contract uniformity but ignored (entity is not project-scoped).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @Status      NVARCHAR(50)  = NULL,
    @Priority    NVARCHAR(50)  = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25
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

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_');

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
           [ProjectStatus],
           [ProjectPhase],
           [RiskLevel],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           TotalCount = COUNT(*) OVER ()
    FROM app.Project
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, Project.ProjectId, 0) acc
    WHERE IsDeleted = 0
      AND (@Search IS NULL OR [ProjectName] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR [ProjectManager] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR [ProjectSponsor] LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR [Mandate] LIKE N'%' + @Search + N'%' ESCAPE N'\')
      AND (@Status IS NULL OR [ProjectStatus] = @Status)
      AND (@Priority IS NULL OR [ProjectPriority] = @Priority)
      -- Row-level access (ADR-0021): Admin sees every project; everyone else only theirs.
      AND acc.AccessLevel IS NOT NULL
    ORDER BY
        CASE WHEN @SortBy = N'ProjectName' AND @SortDir = 'asc'  THEN [ProjectName] END ASC,
        CASE WHEN @SortBy = N'ProjectName' AND @SortDir = 'desc' THEN [ProjectName] END DESC,
        CASE WHEN @SortBy = N'DateOfProject' AND @SortDir = 'asc'  THEN [DateOfProject] END ASC,
        CASE WHEN @SortBy = N'DateOfProject' AND @SortDir = 'desc' THEN [DateOfProject] END DESC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'asc'  THEN [StartDate] END ASC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'desc' THEN [StartDate] END DESC,
        CASE WHEN @SortBy = N'EndDate' AND @SortDir = 'asc'  THEN [EndDate] END ASC,
        CASE WHEN @SortBy = N'EndDate' AND @SortDir = 'desc' THEN [EndDate] END DESC,
        CASE WHEN @SortBy = N'ProjectStatus' AND @SortDir = 'asc'  THEN [ProjectStatus] END ASC,
        CASE WHEN @SortBy = N'ProjectStatus' AND @SortDir = 'desc' THEN [ProjectStatus] END DESC,
        CASE WHEN @SortBy = N'ProjectPriority' AND @SortDir = 'asc'  THEN [ProjectPriority] END ASC,
        CASE WHEN @SortBy = N'ProjectPriority' AND @SortDir = 'desc' THEN [ProjectPriority] END DESC,
        CASE WHEN @SortBy = N'ProjectManager' AND @SortDir = 'asc'  THEN [ProjectManager] END ASC,
        CASE WHEN @SortBy = N'ProjectManager' AND @SortDir = 'desc' THEN [ProjectManager] END DESC,
        ProjectId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
