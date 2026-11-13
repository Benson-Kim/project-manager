-- usp_ChecklistColumn_List — a checklist's columns, in their order (ADR-0066).
-- Row-level access: the checklist's project must be accessible at Viewer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistColumn_List
    @ChecklistId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId INT =
        (SELECT ProjectId FROM app.Checklist WHERE ChecklistId = @ChecklistId AND IsDeleted = 0);
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Checklist not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT ChecklistColumnId, ChecklistId, Name, Kind, ActionKind, SortOrder,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ChecklistColumn
    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0
    ORDER BY SortOrder, ChecklistColumnId;
END;
GO
