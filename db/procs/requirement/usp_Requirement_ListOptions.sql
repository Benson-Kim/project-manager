-- usp_Requirement_ListOptions — the project's live business and stakeholder requirements, for the
-- link picker in the register's sheet (ADR-0037). Needs only: a trace link always runs from a
-- solution to a need.
-- Row-level access: the project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass).
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

    SELECT RequirementId,
           RequirementType,
           Number,
           Requirement
    FROM app.Requirement
    WHERE ProjectId = @ProjectId
      AND IsDeleted = 0
      AND RequirementType IN ('BR', 'SR')
    ORDER BY CASE RequirementType
                 WHEN 'BR' THEN 1 WHEN 'SR' THEN 2 WHEN 'FR' THEN 3
                 WHEN 'NFR' THEN 4 WHEN 'TR' THEN 5 END,
             Number;
END;
GO
