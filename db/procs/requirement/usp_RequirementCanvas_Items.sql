-- usp_RequirementCanvas_Items — every live WBS item and requirement of the canvas's project, marked
--   with what the canvas shows (ADR-0061): the left pane lists them all and a reveal costs no round
--   trip. Bounded by one project, and Title and Summary are cut to 400 so long text does not travel.
--   The full text is read by id before an edit, so never save a Title back.
-- Row-level access: Viewer on the project, taken from the canvas row.
-- Requirements have no description column: Title is the requirement text and Summary its acceptance
--   criteria. WBS items use their name and note. Status is 'Met' or 'NotMet' on a requirement and the
--   item's own status on a WBS item. ParentId is NULL when the parent has been deleted.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvas_Items
    @RequirementCanvasId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.RequirementCanvas
    WHERE RequirementCanvasId = @RequirementCanvasId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Canvas not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT i.Kind, i.ItemId, i.Ref, i.[Type], i.Title, i.Summary, i.[Status], i.ParentId,
           CAST(CASE WHEN n.RequirementCanvasNodeId IS NULL THEN 0 ELSE 1 END AS BIT) AS OnCanvas,
           n.X,
           n.Y,
           ISNULL(n.IsCollapsed, CAST(0 AS BIT)) AS IsCollapsed
    FROM (
        SELECT 'Wbs' AS Kind, kd.KeyDeliverableId AS ItemId, ISNULL(w.WbsCode, N'') AS Ref,
               'WBS' AS [Type], LEFT(ISNULL(kd.KeyRequirement, N''), 400) AS Title,
               LEFT(kd.Note, 400) AS Summary, kd.[Status], p.KeyDeliverableId AS ParentId,
               0 AS TypeOrder, ISNULL(w.WbsKey, N'') AS SortPath,
               NULL AS RequirementId, kd.KeyDeliverableId AS KeyDeliverableId
        FROM app.KeyDeliverable AS kd
        LEFT JOIN dbo.ufn_KeyDeliverable_WbsCode(@RowProjectId) AS w
            ON w.KeyDeliverableId = kd.KeyDeliverableId
        LEFT JOIN app.KeyDeliverable AS p
            ON p.KeyDeliverableId = kd.ParentKeyDeliverableId AND p.IsDeleted = 0
        WHERE kd.ProjectId = @RowProjectId AND kd.IsDeleted = 0
        UNION ALL
        SELECT 'Requirement', r.RequirementId, ap.Ref, r.RequirementType, LEFT(r.Requirement, 400),
               LEFT(r.AcceptanceCriteria, 400),
               CASE WHEN r.IsMet = 1 THEN N'Met' ELSE N'NotMet' END, p.RequirementId,
               CASE r.RequirementType
                   WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                   WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 WHEN 'TC' THEN 6 END,
               ap.SortPath, r.RequirementId, NULL
        FROM app.Requirement AS r
        CROSS APPLY dbo.ufn_Requirement_AncestorPath(r.RequirementId) AS ap
        LEFT JOIN app.Requirement AS p
            ON p.RequirementId = r.ParentRequirementId AND p.IsDeleted = 0
        WHERE r.ProjectId = @RowProjectId AND r.IsDeleted = 0
    ) AS i
    LEFT JOIN app.RequirementCanvasNode AS n
        ON n.RequirementCanvasId = @RequirementCanvasId
       AND (n.RequirementId = i.RequirementId OR n.KeyDeliverableId = i.KeyDeliverableId)
    ORDER BY i.TypeOrder, i.SortPath;
END;
GO
