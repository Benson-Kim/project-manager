-- usp_ProjectPermission_List — every per-person permission override in one project (ADR-0024), for the
-- team's cog: who has which section's create / update / delete granted (Allowed = 1) or revoked (0).
-- Row-level access: Manager on the project — the people who manage the team (FORBIDDEN_ROW 50003).
-- Entity app.ProjectPermissionOverride. Module: projects (team permissions).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectPermission_List
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Manager';

    SELECT o.UserId, o.[Module], o.Verb, o.Allowed
    FROM app.ProjectPermissionOverride o
    WHERE o.ProjectId = @ProjectId
    ORDER BY o.UserId, o.[Module], o.Verb;
END;
GO
