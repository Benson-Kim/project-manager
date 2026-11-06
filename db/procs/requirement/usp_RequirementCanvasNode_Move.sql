-- usp_RequirementCanvasNode_Move — save positions and collapse flags for a batch of nodes (ADR-0061).
--   @NodesJson is an array of at most 2,000 objects: {kind, itemId, x, y, isCollapsed}, kind being
--   'Requirement' or 'Wbs'. Every key is required, so a missing value is refused and never read as
--   a cleared one. A null x and y clears the position, which hands the node back to auto layout.
--   The strict paths and the CATCH turn a wrong type or a missing key into a VALIDATION answer.
--   An item no longer on the canvas is skipped: someone else removed it, and that stands.
-- Access: Contributor + requirements:update. The project comes from the canvas.
-- Not versioned or audited: a stale position harms nothing, a 409 on every drag would make the
--   canvas unusable, and an audit row per drag would bury real changes. The last drag wins.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvasNode_Move
    @RequirementCanvasId INT,
    @NodesJson           NVARCHAR(MAX),
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

    IF @NodesJson IS NULL OR ISJSON(@NodesJson) <> 1 OR LEFT(LTRIM(@NodesJson), 1) <> N'['
        THROW 50004, N'VALIDATION:Nodes must be a JSON array', 1;

    IF (SELECT COUNT(*) FROM OPENJSON(@NodesJson)) > 2000
        THROW 50004, N'VALIDATION:At most 2,000 items can move at once', 1;

    DECLARE @Nodes TABLE (Kind VARCHAR(12), ItemId INT, X INT, Y INT, IsCollapsed BIT);

    BEGIN TRY
        INSERT INTO @Nodes (Kind, ItemId, X, Y, IsCollapsed)
        SELECT kind, itemId, x, y, isCollapsed
        FROM OPENJSON(@NodesJson)
             WITH (kind        VARCHAR(12) 'strict $.kind',
                   itemId      INT         'strict $.itemId',
                   x           INT         'strict $.x',
                   y           INT         'strict $.y',
                   isCollapsed BIT         'strict $.isCollapsed');
    END TRY
    BEGIN CATCH
        THROW 50004, N'VALIDATION:Each node needs an item, a whole-number position and a collapse flag', 1;
    END CATCH;

    IF EXISTS (SELECT 1 FROM @Nodes
               WHERE Kind IS NULL OR Kind NOT IN ('Requirement', 'Wbs')
                  OR ItemId IS NULL OR IsCollapsed IS NULL
                  OR (X IS NULL AND Y IS NOT NULL) OR (X IS NOT NULL AND Y IS NULL))
        THROW 50004, N'VALIDATION:Each node needs an item, a whole-number position and a collapse flag', 1;

    IF EXISTS (SELECT 1 FROM @Nodes GROUP BY Kind, ItemId HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:An item is listed twice', 1;

    UPDATE n SET
        X            = w.X,
        Y            = w.Y,
        IsCollapsed  = w.IsCollapsed,
        UpdatedAtUtc = SYSUTCDATETIME()
    FROM app.RequirementCanvasNode AS n
    JOIN @Nodes AS w
        ON (w.Kind = 'Requirement' AND w.ItemId = n.RequirementId)
        OR (w.Kind = 'Wbs' AND w.ItemId = n.KeyDeliverableId)
    WHERE n.RequirementCanvasId = @RequirementCanvasId;

    SELECT @RowProjectId AS ProjectId;
END;
GO
