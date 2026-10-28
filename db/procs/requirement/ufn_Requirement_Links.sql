-- ufn_Requirement_Links — one requirement's links as the three JSON columns the register reads
-- (ADR-0037): the needs it validates, the solutions that validate it, and the deliverables it is
-- allocated to. Shared by usp_Requirement_List and usp_Requirement_GetById so the shapes cannot
-- drift. Deleted rows and deleted deliverables are left out. Procs only; the application never
-- calls it. Lives beside the procs; db-apply applies every ufn_ before any usp_, and this one
-- binds to ufn_Requirement_AncestorPath, which sorts before it.
-- Each linked requirement carries its own ref and sortPath from ufn_Requirement_AncestorPath
-- (ADR-0048), not a number: a chip must read "BR-1.2" when the trace points at a sub-requirement,
-- and the register is paged, so the browser cannot work the path out for a row it was not sent.
-- The order is the register's — catalog type order, then the path — which is what refList repeats
-- in TypeScript when it re-sorts chips the server already ordered.
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
            SELECT n.RequirementId AS id, n.RequirementType AS [type],
                   np.Ref AS ref, np.SortPath AS sortPath
            FROM app.RequirementTrace AS t
            JOIN app.Requirement AS n
                ON n.RequirementId = t.ValidatesRequirementId AND n.IsDeleted = 0
            CROSS APPLY dbo.ufn_Requirement_AncestorPath(n.RequirementId) AS np
            WHERE t.RequirementId = @RequirementId
            ORDER BY CASE n.RequirementType
                         WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                         WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END,
                     np.SortPath
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ),
        ValidatedByJson = (
            SELECT s.RequirementId AS id, s.RequirementType AS [type],
                   sp.Ref AS ref, sp.SortPath AS sortPath,
                   s.IsMet AS isMet
            FROM app.RequirementTrace AS t
            JOIN app.Requirement AS s
                ON s.RequirementId = t.RequirementId AND s.IsDeleted = 0
            CROSS APPLY dbo.ufn_Requirement_AncestorPath(s.RequirementId) AS sp
            WHERE t.ValidatesRequirementId = @RequirementId
            ORDER BY CASE s.RequirementType
                         WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                         WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END,
                     sp.SortPath
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
