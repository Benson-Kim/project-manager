-- usp_Stakeholder_Matrix — one project's power/interest matrix: every active stakeholder of the
--   project with its name, project role, stance, place and key message strategy, and RowVer for a
--   move (usp_Stakeholder_Place). Placed or not; the app lists unplaced rows beside the grid.
-- Whole project, not paged, as usp_KeyDeliverable_GanttData is: the grid draws the register at
--   once, and a project's register is tens of rows. Places are per project, since each row
--   belongs to one project.
-- Row-level access: Viewer on the project (dbo.usp_Project_AssertAccess, FORBIDDEN_ROW 50003;
--   Admin bypass).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Stakeholder_Matrix
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT StakeholderId,
           [FirstName],
           [LastName],
           [ProjectRole],
           [Stance],
           [Power],
           [Interest],
           [KeyMessageStrategy],
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Stakeholder
    WHERE ProjectId = @ProjectId AND IsDeleted = 0
    ORDER BY [LastName], [FirstName], StakeholderId;
END;
GO
