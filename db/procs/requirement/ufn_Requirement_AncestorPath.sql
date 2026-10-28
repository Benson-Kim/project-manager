-- ufn_Requirement_AncestorPath — one requirement's reference, built from the chain above it
-- (ADR-0048): "FR-1.1.1" for display, a zero-padded SortPath to order by, and the Depth the
-- register indents with.
--
-- The single definition of what a reference *is*. Every surface that shows one reads it from here
-- — usp_Requirement_{List,GetById,ListOptions}, ufn_Requirement_Links for the trace chips, and
-- usp_KeyDeliverable_GanttData for the WBS chip — so the register and the WBS cannot disagree
-- about what a requirement is called. Nothing composes a reference from (type, number) any more:
-- that only ever worked while the register was flat.
--
-- Why a walk and not a stored column: a path column would go stale behind a renumber, and the
-- register is paged (ADR-0016, 100 rows), so a child can land on a different page from its parent
-- and the browser could not assemble the path itself. The walk is one seek per level and the write
-- procs cap the depth at four, so it is bounded wherever it is applied.
--
-- SortPath is padded to ten digits per level because CK_Requirement_Number permits any positive
-- INT, and '1.10' sorts before '1.2' as text. Ten digits is the widest an INT can be, so the
-- padding is correct for every number the constraint allows rather than merely for small ones.
--
-- Distance < 50 bounds the recursion as ufn_KeyDeliverable_Ancestors does; the 600-wide results
-- hold a chain that long without truncating, though the procs refuse anything past four levels.
-- Soft-deleted rows are walked through deliberately: a reference stays derivable even if an
-- ancestor is deleted, so callers decide what to hide rather than losing the path. Procs only;
-- the application never calls it. Sorts before ufn_Requirement_Links, which binds to it at create
-- time, and db-apply applies every ufn_ before any usp_.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_Requirement_AncestorPath
(
    @RequirementId INT
)
RETURNS TABLE
AS
RETURN
    WITH chain AS (
        SELECT r.RequirementId, r.ParentRequirementId, r.RequirementType, r.Number, 0 AS Distance
        FROM app.Requirement AS r
        WHERE r.RequirementId = @RequirementId
        UNION ALL
        SELECT p.RequirementId, p.ParentRequirementId, p.RequirementType, p.Number, c.Distance + 1
        FROM chain AS c
        JOIN app.Requirement AS p ON p.RequirementId = c.ParentRequirementId
        WHERE c.Distance < 50
    )
    SELECT
        -- The requirement's own type, not an ancestor's: a child inherits its parent's type, so
        -- they agree, and taking Distance 0 says which one is meant if direct SQL ever split them.
        Ref = CAST(CONCAT(MAX(CASE WHEN c.Distance = 0 THEN c.RequirementType END), '-',
                          STRING_AGG(CAST(c.Number AS VARCHAR(10)), '.')
                              WITHIN GROUP (ORDER BY c.Distance DESC)) AS NVARCHAR(600)),
        SortPath = CAST(STRING_AGG(RIGHT(CONCAT('0000000000', CAST(c.Number AS VARCHAR(10))), 10), '.')
                            WITHIN GROUP (ORDER BY c.Distance DESC) AS VARCHAR(600)),
        Depth = MAX(c.Distance)
    FROM chain AS c;
GO
