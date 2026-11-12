-- usp_BpmnDiagram_Rename — rename a diagram (ADR-0064).
-- Access: Contributor + bpmn:update. The project comes from the row. A stale @RowVer answers 409.
--   Answers with the same columns as usp_BpmnDiagram_List, plus ProjectId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BpmnDiagram_Rename
    @BpmnDiagramId INT,
    @Name          NVARCHAR(200),
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentVer BIGINT, @OldName NVARCHAR(120);
    SELECT @RowProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @OldName = Name
    FROM app.BpmnDiagram
    WHERE BpmnDiagramId = @BpmnDiagramId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Diagram not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'bpmn:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Diagram was modified by someone else', 1;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    EXEC dbo.usp_BpmnDiagram_AssertName
         @ProjectId = @RowProjectId, @BpmnDiagramId = @BpmnDiagramId, @Name = @Name;

    UPDATE app.BpmnDiagram SET
        Name         = @Name,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE BpmnDiagramId = @BpmnDiagramId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Diagram was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.BpmnDiagram', CAST(@BpmnDiagramId AS NVARCHAR(64)),
            (SELECT @OldName AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Name AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT BpmnDiagramId, ProjectId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BpmnDiagram
    WHERE BpmnDiagramId = @BpmnDiagramId;
END;
GO
