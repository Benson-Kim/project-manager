-- usp_KeyDeliverable_AssertPlacement — whether an item may sit under @ParentKeyDeliverableId
-- (NULL = top level) in the project's work breakdown (ADR-0027); VALIDATION 50004 otherwise:
--   * the parent is a live item of the same project (no cross-project parent);
--   * the parent is not a milestone, which is a date and so has no room beneath it (ADR-0046);
--   * a moved item (@KeyDeliverableId) is not placed under itself or its own sub-items;
--   * the result is at most 10 levels deep, counting the moved item's own sub-items.
-- Called by usp_KeyDeliverable_{Create,Move} after their access check, inside their transaction
-- and the project lock, so two concurrent moves cannot build a cycle. Checks no access itself.
-- The limit must equal MAX_WBS_DEPTH in src/modules/key-deliverables/schemas/wbs.ts.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_AssertPlacement
    @ProjectId              INT,
    @ParentKeyDeliverableId INT = NULL,
    @KeyDeliverableId       INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaxDepth INT = 10;

    DECLARE @Height INT = 1;
    IF @KeyDeliverableId IS NOT NULL
        SELECT @Height = ISNULL(MAX(Depth), 0) + 1
        FROM dbo.ufn_KeyDeliverable_Branch(@KeyDeliverableId);

    IF @ParentKeyDeliverableId IS NULL
    BEGIN
        IF @Height > @MaxDepth
            THROW 50004, N'VALIDATION:A work breakdown has at most 10 levels', 1;
        RETURN;
    END;

    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverable
                   WHERE KeyDeliverableId = @ParentKeyDeliverableId
                     AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:The parent item is not in this project', 1;

    IF EXISTS (SELECT 1 FROM app.KeyDeliverable
               WHERE KeyDeliverableId = @ParentKeyDeliverableId AND IsMilestone = 1)
        THROW 50004, N'VALIDATION:A milestone is a date, so it takes no sub-items', 1;

    IF @KeyDeliverableId IS NOT NULL
       AND EXISTS (SELECT 1 FROM dbo.ufn_KeyDeliverable_Ancestors(@ParentKeyDeliverableId)
                   WHERE KeyDeliverableId = @KeyDeliverableId)
        THROW 50004, N'VALIDATION:An item cannot go under itself or its own sub-items', 1;

    DECLARE @ParentLevel INT =
        (SELECT COUNT(*) FROM dbo.ufn_KeyDeliverable_Ancestors(@ParentKeyDeliverableId));

    IF @ParentLevel + @Height > @MaxDepth
        THROW 50004, N'VALIDATION:A work breakdown has at most 10 levels', 1;
END;
GO
