-- ufn_KeyDeliverable_Branch — an item and every live item below it in the work breakdown
-- (ADR-0027), with Depth 0 for the item itself, 1 for its sub-items, and so on. Empty when the
-- item is gone. Procs only; the application never calls it.
-- Callers: usp_KeyDeliverable_{AssertPlacement,Delete,GetById,Reschedule}.
-- Lives beside the procs; db-apply creates ufn_* before usp_* in a folder.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_KeyDeliverable_Branch
(
    @KeyDeliverableId INT
)
RETURNS TABLE
AS
RETURN
    WITH branch AS (
        SELECT kd.KeyDeliverableId, 0 AS Depth
        FROM app.KeyDeliverable AS kd
        WHERE kd.KeyDeliverableId = @KeyDeliverableId AND kd.IsDeleted = 0
        UNION ALL
        SELECT c.KeyDeliverableId, b.Depth + 1
        FROM branch AS b
        JOIN app.KeyDeliverable AS c
            ON c.ParentKeyDeliverableId = b.KeyDeliverableId AND c.IsDeleted = 0
        WHERE b.Depth < 50
    )
    SELECT KeyDeliverableId, Depth FROM branch;
GO
