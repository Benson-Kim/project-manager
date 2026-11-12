-- usp_BpmnDiagram_Update — save a diagram's drawing, whole (ADR-0064).
-- Access: Contributor + bpmn:update. The project comes from the row. A stale @RowVer answers 409,
--   so a second editor never overwrites the first. The app validates the document's shape; this
--   proc refuses anything that is not version 1 JSON of at most 300,000 characters. The audit row
--   keeps the element counts, not the drawing, so a save does not copy the document into the log.
--   Answers with the new RowVer and the row's ProjectId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BpmnDiagram_Update
    @BpmnDiagramId INT,
    @DiagramJson   NVARCHAR(MAX),
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentVer BIGINT, @OldJson NVARCHAR(MAX);
    SELECT @RowProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @OldJson = DiagramJson
    FROM app.BpmnDiagram
    WHERE BpmnDiagramId = @BpmnDiagramId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Diagram not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'bpmn:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Diagram was modified by someone else', 1;

    IF @DiagramJson IS NULL OR LEN(@DiagramJson) > 300000
        THROW 50004, N'VALIDATION:The diagram is too large to save', 1;
    IF ISJSON(@DiagramJson) <> 1
        THROW 50004, N'VALIDATION:The diagram could not be read', 1;
    IF ISNULL(JSON_VALUE(@DiagramJson, N'$.version'), N'') <> N'1'
       OR JSON_QUERY(@DiagramJson, N'$.pools') IS NULL
       OR JSON_QUERY(@DiagramJson, N'$.shapes') IS NULL
       OR JSON_QUERY(@DiagramJson, N'$.flows') IS NULL
        THROW 50004, N'VALIDATION:The diagram could not be read', 1;

    BEGIN TRAN;

    UPDATE app.BpmnDiagram SET
        DiagramJson  = @DiagramJson,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE BpmnDiagramId = @BpmnDiagramId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Diagram was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.BpmnDiagram', CAST(@BpmnDiagramId AS NVARCHAR(64)),
            (SELECT (SELECT COUNT(*) FROM OPENJSON(@OldJson, N'$.pools')) AS pools,
                    (SELECT COUNT(*) FROM OPENJSON(@OldJson, N'$.shapes')) AS shapes,
                    (SELECT COUNT(*) FROM OPENJSON(@OldJson, N'$.flows')) AS flows
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT (SELECT COUNT(*) FROM OPENJSON(@DiagramJson, N'$.pools')) AS pools,
                    (SELECT COUNT(*) FROM OPENJSON(@DiagramJson, N'$.shapes')) AS shapes,
                    (SELECT COUNT(*) FROM OPENJSON(@DiagramJson, N'$.flows')) AS flows
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT BpmnDiagramId, ProjectId, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BpmnDiagram
    WHERE BpmnDiagramId = @BpmnDiagramId;
END;
GO
