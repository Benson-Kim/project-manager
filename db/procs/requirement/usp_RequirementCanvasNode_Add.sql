-- usp_RequirementCanvasNode_Add — reveal one item on a canvas (ADR-0061). Names exactly one of
--   @RequirementId and @KeyDeliverableId. @X, @Y place it where it was dropped; NULL leaves it to
--   auto layout. Repeating it succeeds and changes nothing, including the position, and the
--   UPDLOCK, HOLDLOCK check keeps two at once from colliding on the unique index.
-- Access: Contributor + requirements:update. The project comes from the canvas. An item that is
--   missing, deleted or in another project answers alike, so an id cannot be probed.
-- Not versioned or audited: a canvas is a view, and the audit log records real changes.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvasNode_Add
    @RequirementCanvasId INT,
    @RequirementId       INT = NULL,
    @KeyDeliverableId    INT = NULL,
    @X                   INT = NULL,
    @Y                   INT = NULL,
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

    IF (@X IS NULL AND @Y IS NOT NULL) OR (@X IS NOT NULL AND @Y IS NULL)
        THROW 50004, N'VALIDATION:A position needs both numbers', 1;

    IF NOT EXISTS (SELECT 1 FROM app.Requirement
                   WHERE RequirementId = @RequirementId
                     AND ProjectId = @RowProjectId AND IsDeleted = 0)
       AND NOT EXISTS (SELECT 1 FROM app.KeyDeliverable
                       WHERE KeyDeliverableId = @KeyDeliverableId
                         AND ProjectId = @RowProjectId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:That item was not found', 1;

    INSERT INTO app.RequirementCanvasNode
        (RequirementCanvasId, ProjectId, RequirementId, KeyDeliverableId, X, Y, CreatedBy)
    SELECT @RequirementCanvasId, @RowProjectId, @RequirementId, @KeyDeliverableId, @X, @Y, @ActorUserId
    WHERE NOT EXISTS (SELECT 1 FROM app.RequirementCanvasNode WITH (UPDLOCK, HOLDLOCK)
                      WHERE RequirementCanvasId = @RequirementCanvasId
                        AND (RequirementId = @RequirementId OR KeyDeliverableId = @KeyDeliverableId));

    SELECT @RowProjectId AS ProjectId;
END;
GO
