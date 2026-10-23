-- usp_Board_AssertAccess — asserts the board access rule (ADR-0038) for one board; shared by every
-- board, column, phase, sprint and card proc. The rule itself is dbo.ufn_Board_AccessLevel.
--   * The project (and its level) is read from the board row, never from the caller: a board can be
--     linked to another project, so the caller must not be able to name one.
--   * THROW 50001 NOT_FOUND when the board is absent or deleted, and when its project is absent or
--     deleted: deleting a project does not cascade (dbo.usp_Project_Delete), so this is how that
--     project's boards stop being reachable.
--   * 50003 FORBIDDEN_ROW below @MinLevel.
-- @Permission (write procs, ADR-0024): a per-person override of 'boards' in the board's project
-- decides instead of the level (dbo.usp_Permission_Require). A standalone board has no project, so
-- an override can never apply to one.
-- Write procs call this AFTER locking the board row, because the row names the project.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_AssertAccess
    @BoardId     INT,
    @ActorUserId INT,
    @MinLevel    NVARCHAR(20),
    @Permission  NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId INT, @CreatedBy INT, @Level NVARCHAR(20), @ActorRole NVARCHAR(50);
    SELECT @ProjectId = b.ProjectId, @CreatedBy = b.CreatedBy
    FROM app.Board b
    LEFT JOIN app.Project p ON p.ProjectId = b.ProjectId
    WHERE b.BoardId = @BoardId
      AND b.IsDeleted = 0
      AND (b.ProjectId IS NULL OR (p.ProjectId IS NOT NULL AND p.IsDeleted = 0));
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT @Level = AccessLevel
    FROM dbo.ufn_Board_AccessLevel(@ActorRole, @ActorUserId, @ProjectId, @CreatedBy);

    EXEC dbo.usp_Permission_Require
        @Level = @Level, @MinLevel = @MinLevel, @ProjectId = @ProjectId,
        @ActorUserId = @ActorUserId, @ActorRole = @ActorRole, @Permission = @Permission;
END;
GO
