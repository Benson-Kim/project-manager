-- usp_BpmnDiagram_GetById — one diagram with its drawing (ADR-0064).
-- Row-level access: the project comes from the row and must be accessible at Viewer. A deleted
--   diagram and a missing one answer alike.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BpmnDiagram_GetById
    @BpmnDiagramId INT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.BpmnDiagram
    WHERE BpmnDiagramId = @BpmnDiagramId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Diagram not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT BpmnDiagramId, ProjectId, Name, DiagramJson, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BpmnDiagram
    WHERE BpmnDiagramId = @BpmnDiagramId AND IsDeleted = 0;
END;
GO
