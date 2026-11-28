-- usp_PageNote_ListForLocation — lists up to TOP (200) active small page notes at a location.
-- Enforces live endpoint resolution and Viewer+ access (ADR-0074).
-- Personal on every page: returns only notes created by @ActorUserId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_PageNote_ListForLocation
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

    DECLARE @LiveLocProjectId INT, @LocLevel NVARCHAR(20);
    SELECT @LiveLocProjectId = r.LiveProjectId, @LocLevel = r.AccessLevel
    FROM dbo.ufn_CrossLink_ResolveEndpoint(
        @ModuleKey, @ProjectId, @EntityId, NULL, NULL, @ActorRole, @ActorUserId
    ) AS r;
    IF @LocLevel IS NULL
    BEGIN
        SELECT TOP (0)
               pn.PageNoteId, pn.ModuleKey, pn.ProjectId, pn.EntityId, pn.SubEntityId,
               pn.AnchorKind, pn.AnchorKey, pn.AnchorLabel, pn.Body, pn.Color,
               pn.CreatedBy, pn.CreatedAtUtc, pn.UpdatedAtUtc, CAST(pn.RowVer AS BIGINT) AS RowVer
        FROM app.PageNote pn;
        RETURN;
    END;

    EXEC dbo.usp_PageNote_AssertAccess
         @ModuleKey = @ModuleKey, @StoredProjectId = @ProjectId, @EntityId = @EntityId,
         @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    DECLARE @IsWorkspaceScoped BIT = CASE WHEN @ModuleKey IN (
        N'note', N'board', N'meetings', N'checklists', N'whiteboard', N'bpmn',
        N'deliverables-canvas', N'financials-budget', N'financials-monitoring',
        N'financials-documents', N'financials-settings', N'financials-sheet'
    ) THEN 1 ELSE 0 END;

    DECLARE @IsMovable BIT = CASE WHEN @ModuleKey IN (
        N'board', N'note', N'todo', N'daily-activity'
    ) THEN 1 ELSE 0 END;

    SELECT TOP (200)
           pn.PageNoteId,
           pn.ModuleKey,
           res.LiveProjectId AS ProjectId,
           pn.EntityId,
           pn.SubEntityId,
           pn.AnchorKind,
           pn.AnchorKey,
           pn.AnchorLabel,
           pn.Body,
           pn.Color,
           pn.CreatedBy,
           pn.CreatedAtUtc,
           pn.UpdatedAtUtc,
           CAST(pn.RowVer AS BIGINT) AS RowVer
    FROM app.PageNote pn
    CROSS APPLY dbo.ufn_CrossLink_ResolveEndpoint(
        pn.ModuleKey, pn.ProjectId, pn.EntityId, pn.SubEntityId, pn.AnchorKey, @ActorRole, @ActorUserId
    ) res
    WHERE pn.IsDeleted = 0
      AND pn.CreatedBy = @ActorUserId
      AND pn.ModuleKey = @ModuleKey
      AND (@IsMovable = 1 OR ISNULL(pn.ProjectId, -1) = ISNULL(@ProjectId, -1))
      AND (
          (@EntityId IS NOT NULL AND pn.EntityId = @EntityId)
          OR (@EntityId IS NULL AND (@IsWorkspaceScoped = 0 OR pn.EntityId IS NULL))
      )
      AND ISNULL(res.LiveProjectId, -1) = ISNULL(@ProjectId, -1)
      AND res.AccessLevel IS NOT NULL
    ORDER BY pn.CreatedAtUtc ASC, pn.PageNoteId ASC;
END;
GO
