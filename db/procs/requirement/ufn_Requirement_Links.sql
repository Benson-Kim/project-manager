-- ufn_Requirement_Links — one requirement's links as the three JSON columns the register reads
-- (ADR-0037): the needs it validates, the solutions that validate it, and the deliverables it is
-- allocated to. Shared by usp_Requirement_List and usp_Requirement_GetById so the shapes cannot
-- drift. Deleted rows and deleted deliverables are left out. Procs only; the application never
-- calls it. Lives beside the procs; db-apply creates ufn_* before usp_* in a folder.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_Requirement_Links
(
    @RequirementId INT
)
RETURNS TABLE
AS
RETURN
    SELECT
        ValidatesJson = (
            SELECT n.RequirementId AS id, n.RequirementType AS [type], n.Number AS [number]
            FROM app.RequirementTrace AS t
            JOIN app.Requirement AS n
                ON n.RequirementId = t.ValidatesRequirementId AND n.IsDeleted = 0
            WHERE t.RequirementId = @RequirementId
            ORDER BY CASE n.RequirementType
                         WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                         WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END,
                     n.Number
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ),
        ValidatedByJson = (
            SELECT s.RequirementId AS id, s.RequirementType AS [type], s.Number AS [number],
                   s.IsMet AS isMet
            FROM app.RequirementTrace AS t
            JOIN app.Requirement AS s
                ON s.RequirementId = t.RequirementId AND s.IsDeleted = 0
            WHERE t.ValidatesRequirementId = @RequirementId
            ORDER BY CASE s.RequirementType
                         WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                         WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END,
                     s.Number
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ),
        DeliverablesJson = (
            SELECT d.KeyDeliverableId AS id
            FROM app.RequirementDeliverable AS d
            JOIN app.KeyDeliverable AS kd
                ON kd.KeyDeliverableId = d.KeyDeliverableId AND kd.IsDeleted = 0
            WHERE d.RequirementId = @RequirementId
            ORDER BY d.SortOrder, d.KeyDeliverableId
            FOR JSON PATH, INCLUDE_NULL_VALUES
        );
GO
