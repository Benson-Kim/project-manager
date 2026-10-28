-- usp_Requirement_ListOptions — the project's live business and stakeholder requirements, for the
-- link picker in the register's sheet (ADR-0037). Needs only: a trace link always runs from a
-- solution to a need.
-- Row-level access: the project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass).
-- Sub-requirements are offered too (ADR-0048): a sub-BR is a need like any other, and the client's
--   own example names subBR1.1, so a solution must be able to trace to one. Each option carries the
--   ref from ufn_Requirement_AncestorPath, which is also what the picker's label shows, and the
--   order is the register's — catalog type order, then the path.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_ListOptions
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT r.RequirementId,
           r.RequirementType,
           ap.Ref,
           r.Requirement
    FROM app.Requirement AS r
    CROSS APPLY dbo.ufn_Requirement_AncestorPath(r.RequirementId) AS ap
    WHERE r.ProjectId = @ProjectId
      AND r.IsDeleted = 0
      AND r.RequirementType IN ('BR', 'SR')
    ORDER BY CASE r.RequirementType
                 WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                 WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END,
             ap.SortPath;
END;
GO
