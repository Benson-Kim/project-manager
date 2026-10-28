-- Board import options: every live requirement type, in register order with hierarchical refs.
-- Requires Viewer access to the source project; packaging separately checks boards:create.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_ListPackagingOptions
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
    ORDER BY CASE r.RequirementType
                 WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                 WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END,
             ap.SortPath;
END;
GO
