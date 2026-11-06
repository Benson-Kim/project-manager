-- usp_RequirementCanvasNode_Remove — hide one item on a canvas (ADR-0061). Names exactly one of
--   @RequirementId and @KeyDeliverableId. The canvas is a view, so the item and its links stay in
--   the register, and an item already hidden answers the same.
-- Access: Contributor + requirements:update. The project comes from the canvas.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvasNode_Remove
    @RequirementCanvasId INT,
    @RequirementId       INT = NULL,
    @KeyDeliverableId    INT = NULL,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.RequirementCanvas
    WHERE RequirementCanvasId = @RequirementCanvasId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Canvas not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF (@RequirementId IS NULL AND @KeyDeliverableId IS NULL)
       OR (@RequirementId IS NOT NULL AND @KeyDeliverableId IS NOT NULL)
        THROW 50004, N'VALIDATION:Pick one item', 1;

    DELETE FROM app.RequirementCanvasNode
    WHERE RequirementCanvasId = @RequirementCanvasId
      AND (RequirementId = @RequirementId OR KeyDeliverableId = @KeyDeliverableId);

    SELECT @RowProjectId AS ProjectId;
END;
GO
