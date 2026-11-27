-- usp_CrossLink_ListForLocation — lists up to TOP (200) active 1-to-1 cross-links touching the
-- requested location. Every returned row resolves BOTH live ends via ufn_CrossLink_ResolveEndpoint
-- and omits any row where either end is soft-deleted or unreadable by @ActorUserId (ADR-0040).
-- Personal: returns only links created by @ActorUserId (ADR-0074).
-- Uses live ProjectId on both ends so links to moved boards/todos/activities heal automatically.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_CrossLink_ListForLocation
    @ModuleKey   NVARCHAR(40),
    @ProjectId   INT = NULL,
    @EntityId    INT = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    IF @ModuleKey IS NULL OR @ModuleKey NOT IN (
        N'dashboard', N'reports', N'project-overview', N'objectives', N'requirements',
        N'deliverables', N'deliverables-canvas', N'deliverables-gantt',
        N'stakeholders', N'stakeholders-matrix', N'responsibility', N'suppliers',
        N'keywords', N'daily-activity', N'todo', N'calendar',
        N'questions-answers', N'parking-lot', N'assumptions-constraints', N'risks-issues',
        N'decisions', N'whiteboard', N'bpmn', N'meetings', N'board', N'checklists', N'note',
        N'financials-budget', N'financials-monitoring', N'financials-documents',
        N'financials-settings', N'financials-project-math', N'financials-sheet'
    )
        THROW 50004, N'VALIDATION:Unknown module', 1;

    DECLARE @IsWorkspaceScoped BIT = CASE WHEN @ModuleKey IN (
        N'note', N'board', N'meetings', N'checklists', N'whiteboard', N'bpmn',
        N'deliverables-canvas', N'financials-budget', N'financials-monitoring',
        N'financials-documents', N'financials-settings', N'financials-sheet'
    ) THEN 1 ELSE 0 END;

    DECLARE @IsMovable BIT = CASE WHEN @ModuleKey IN (
        N'board', N'note', N'todo', N'daily-activity'
    ) THEN 1 ELSE 0 END;

    SELECT TOP (200)
           m.CrossLinkId,
           m.Side,
           m.EndAModule,
           m.EndALiveProjectId AS EndAProjectId,
           m.EndAEntityId,
           m.EndASubEntityId,
           m.EndAAnchorKind,
           m.EndAAnchorKey,
           m.EndALabel,
           m.EndBModule,
           m.EndBLiveProjectId AS EndBProjectId,
           m.EndBEntityId,
           m.EndBSubEntityId,
           m.EndBAnchorKind,
           m.EndBAnchorKey,
           m.EndBLabel,
           m.LinkTitle,
           m.NoteText,
           m.Color,
           m.CreatedBy,
           m.CreatedAtUtc,
           m.UpdatedAtUtc,
           m.RowVer
    FROM (
        SELECT cl.CrossLinkId,
               N'A' AS Side,
               cl.EndAModule,
               resA.LiveProjectId AS EndALiveProjectId,
               cl.EndAEntityId,
               cl.EndASubEntityId,
               cl.EndAAnchorKind,
               cl.EndAAnchorKey,
               cl.EndALabel,
               cl.EndBModule,
               resB.LiveProjectId AS EndBLiveProjectId,
               cl.EndBEntityId,
               cl.EndBSubEntityId,
               cl.EndBAnchorKind,
               cl.EndBAnchorKey,
               cl.EndBLabel,
               cl.LinkTitle,
               cl.NoteText,
               cl.Color,
               cl.CreatedBy,
               cl.CreatedAtUtc,
               cl.UpdatedAtUtc,
               CAST(cl.RowVer AS BIGINT) AS RowVer
        FROM app.CrossLink cl
        CROSS APPLY dbo.ufn_CrossLink_ResolveEndpoint(
            cl.EndAModule, cl.EndAProjectId, cl.EndAEntityId, cl.EndASubEntityId, cl.EndAAnchorKey, @ActorRole, @ActorUserId
        ) resA
        CROSS APPLY dbo.ufn_CrossLink_ResolveEndpoint(
            cl.EndBModule, cl.EndBProjectId, cl.EndBEntityId, cl.EndBSubEntityId, cl.EndBAnchorKey, @ActorRole, @ActorUserId
        ) resB
        WHERE cl.IsDeleted = 0
          AND cl.CreatedBy = @ActorUserId
          AND cl.EndAModule = @ModuleKey
          AND (@IsMovable = 1 OR ISNULL(cl.EndAProjectId, -1) = ISNULL(@ProjectId, -1))
          AND (
              (@EntityId IS NOT NULL AND cl.EndAEntityId = @EntityId)
              OR (@EntityId IS NULL AND (@IsWorkspaceScoped = 0 OR cl.EndAEntityId IS NULL))
          )
          AND ISNULL(resA.LiveProjectId, -1) = ISNULL(@ProjectId, -1)
          AND resA.AccessLevel IS NOT NULL
          AND resB.AccessLevel IS NOT NULL

        UNION ALL

        SELECT cl.CrossLinkId,
               N'B' AS Side,
               cl.EndAModule,
               resA.LiveProjectId AS EndALiveProjectId,
               cl.EndAEntityId,
               cl.EndASubEntityId,
               cl.EndAAnchorKind,
               cl.EndAAnchorKey,
               cl.EndALabel,
               cl.EndBModule,
               resB.LiveProjectId AS EndBLiveProjectId,
               cl.EndBEntityId,
               cl.EndBSubEntityId,
               cl.EndBAnchorKind,
               cl.EndBAnchorKey,
               cl.EndBLabel,
               cl.LinkTitle,
               cl.NoteText,
               cl.Color,
               cl.CreatedBy,
               cl.CreatedAtUtc,
               cl.UpdatedAtUtc,
               CAST(cl.RowVer AS BIGINT) AS RowVer
        FROM app.CrossLink cl
        CROSS APPLY dbo.ufn_CrossLink_ResolveEndpoint(
            cl.EndAModule, cl.EndAProjectId, cl.EndAEntityId, cl.EndASubEntityId, cl.EndAAnchorKey, @ActorRole, @ActorUserId
        ) resA
        CROSS APPLY dbo.ufn_CrossLink_ResolveEndpoint(
            cl.EndBModule, cl.EndBProjectId, cl.EndBEntityId, cl.EndBSubEntityId, cl.EndBAnchorKey, @ActorRole, @ActorUserId
        ) resB
        WHERE cl.IsDeleted = 0
          AND cl.CreatedBy = @ActorUserId
          AND cl.EndBModule = @ModuleKey
          AND (@IsMovable = 1 OR ISNULL(cl.EndBProjectId, -1) = ISNULL(@ProjectId, -1))
          AND (
              (@EntityId IS NOT NULL AND cl.EndBEntityId = @EntityId)
              OR (@EntityId IS NULL AND (@IsWorkspaceScoped = 0 OR cl.EndBEntityId IS NULL))
          )
          AND ISNULL(resB.LiveProjectId, -1) = ISNULL(@ProjectId, -1)
          AND resA.AccessLevel IS NOT NULL
          AND resB.AccessLevel IS NOT NULL
    ) m
    ORDER BY m.CreatedAtUtc ASC, m.CrossLinkId ASC, m.Side ASC;
END;
GO
