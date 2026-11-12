-- usp_BpmnDiagram_AssertName — the rules a diagram's name meets (ADR-0064).
-- Internal: usp_BpmnDiagram_Create and _Rename call it after their own access check, inside their
--   transaction and the project lock, so two writes cannot pass the name check together. It asserts
--   no access itself and is named in EXEMPT in src/tests/proc-access-levels.test.ts.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BpmnDiagram_AssertName
    @ProjectId     INT,
    @BpmnDiagramId INT = NULL,
    @Name          NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Diagram names are only checked inside a diagram write', 1;

    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 120
        THROW 50004, N'VALIDATION:Enter a diagram name of up to 120 characters', 1;

    IF EXISTS (SELECT 1 FROM app.BpmnDiagram
               WHERE ProjectId = @ProjectId AND IsDeleted = 0 AND Name = @Name
                 AND (@BpmnDiagramId IS NULL OR BpmnDiagramId <> @BpmnDiagramId))
        THROW 50005, N'DUPLICATE:A diagram with this name already exists', 1;
END;
GO
