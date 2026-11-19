-- usp_Whiteboard_GetById — one whiteboard with its drawing (migration 086).
-- Row-level access: the project comes from the row and must be accessible at Viewer. A deleted
--   whiteboard and a missing one answer alike.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Whiteboard_GetById
    @WhiteboardId INT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.Whiteboard
    WHERE WhiteboardId = @WhiteboardId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Whiteboard not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT WhiteboardId, ProjectId, Name, BoardJson, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Whiteboard
    WHERE WhiteboardId = @WhiteboardId AND IsDeleted = 0;
END;
GO
