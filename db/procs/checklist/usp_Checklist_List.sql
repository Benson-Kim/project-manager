-- usp_Checklist_List — a project's checklists, by name (ADR-0066).
-- Row-level access: the project must be accessible at Viewer. A project holds few checklists, so
--   the list is not paged.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Checklist_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT ChecklistId, ProjectId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Checklist
    WHERE ProjectId = @ProjectId AND IsDeleted = 0
    ORDER BY Name;
END;
GO
