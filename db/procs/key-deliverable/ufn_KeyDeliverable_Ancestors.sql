-- ufn_KeyDeliverable_Ancestors — an item and the items above it in the work breakdown
-- (ADR-0027), with Distance 0 for the item itself, 1 for its parent, and so on. The row count is
-- the item's level (a top-level item is level 1). Procs only; the application never calls it.
-- Caller: usp_KeyDeliverable_AssertPlacement.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_KeyDeliverable_Ancestors
(
    @KeyDeliverableId INT
)
RETURNS TABLE
AS
RETURN
    WITH chain AS (
        SELECT kd.KeyDeliverableId, kd.ParentKeyDeliverableId, 0 AS Distance
        FROM app.KeyDeliverable AS kd
        WHERE kd.KeyDeliverableId = @KeyDeliverableId
        UNION ALL
        SELECT p.KeyDeliverableId, p.ParentKeyDeliverableId, c.Distance + 1
        FROM chain AS c
        JOIN app.KeyDeliverable AS p ON p.KeyDeliverableId = c.ParentKeyDeliverableId
        WHERE c.Distance < 50
    )
    SELECT KeyDeliverableId, Distance FROM chain;
GO
