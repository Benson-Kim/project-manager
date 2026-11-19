-- usp_Whiteboard_List — a project's whiteboards, by name, without their drawings (migration 086).
-- Row-level access: the project must be accessible at Viewer. A project holds few whiteboards, so the
--   list is not paged.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Whiteboard_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT WhiteboardId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Whiteboard
    WHERE ProjectId = @ProjectId AND IsDeleted = 0
    ORDER BY Name;
END;
GO
