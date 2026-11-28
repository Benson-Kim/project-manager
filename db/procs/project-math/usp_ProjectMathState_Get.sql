-- usp_ProjectMathState_Get — the project's saved Project Math inputs, or no row when nothing is saved yet.
-- Access: Viewer on the project.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectMathState_Get
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT StateJson, CAST(RowVer AS BIGINT) AS RowVer, UpdatedAtUtc
    FROM app.ProjectMathState
    WHERE ProjectId = @ProjectId;
END;
GO
