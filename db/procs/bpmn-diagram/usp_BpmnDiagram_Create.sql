-- usp_BpmnDiagram_Create — a new, empty diagram (ADR-0064).
-- Access: Contributor + bpmn:create. Answers with the same columns as usp_BpmnDiagram_List.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BpmnDiagram_Create
    @ProjectId   INT,
    @Name        NVARCHAR(200),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'bpmn:create', @AllowProjectless = 0;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    EXEC dbo.usp_BpmnDiagram_AssertName @ProjectId = @ProjectId, @Name = @Name;

    INSERT INTO app.BpmnDiagram (ProjectId, Name, DiagramJson, CreatedBy)
    VALUES (@ProjectId, @Name, N'{"version":1,"pools":[],"shapes":[],"flows":[]}', @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.BpmnDiagram', CAST(@Id AS NVARCHAR(64)),
            (SELECT @Id AS bpmnDiagramId, @ProjectId AS projectId, @Name AS name
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT BpmnDiagramId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BpmnDiagram
    WHERE BpmnDiagramId = @Id;
END;
GO
