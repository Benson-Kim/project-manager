-- usp_RequirementCanvas_List — a project's canvases with how many items each shows (ADR-0061).
-- Row-level access: the project must be accessible at Viewer. A project holds few canvases, so the
--   list is not paged. NodeCount leaves out items deleted since they were revealed, and a canvas
--   filed under a deleted WBS item reads as unfiled.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvas_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT c.RequirementCanvasId,
           c.Name,
           kd.KeyDeliverableId,
           (SELECT COUNT(*)
            FROM app.RequirementCanvasNode AS n
            LEFT JOIN app.Requirement AS r
                ON r.RequirementId = n.RequirementId AND r.IsDeleted = 0
            LEFT JOIN app.KeyDeliverable AS k
                ON k.KeyDeliverableId = n.KeyDeliverableId AND k.IsDeleted = 0
            WHERE n.RequirementCanvasId = c.RequirementCanvasId
              AND (r.RequirementId IS NOT NULL OR k.KeyDeliverableId IS NOT NULL)) AS NodeCount,
           CAST(c.RowVer AS BIGINT) AS RowVer
    FROM app.RequirementCanvas AS c
    LEFT JOIN app.KeyDeliverable AS kd
        ON kd.KeyDeliverableId = c.KeyDeliverableId AND kd.IsDeleted = 0
    WHERE c.ProjectId = @ProjectId AND c.IsDeleted = 0
    ORDER BY c.Name;
END;
GO
