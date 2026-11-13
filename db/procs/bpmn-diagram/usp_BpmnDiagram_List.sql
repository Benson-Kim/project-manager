-- usp_BpmnDiagram_List — a project's diagrams, by name, without their drawings (ADR-0064).
-- Row-level access: the project must be accessible at Viewer. A project holds few diagrams, so the
--   list is not paged.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BpmnDiagram_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT BpmnDiagramId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BpmnDiagram
    WHERE ProjectId = @ProjectId AND IsDeleted = 0
    ORDER BY Name;
END;
GO
