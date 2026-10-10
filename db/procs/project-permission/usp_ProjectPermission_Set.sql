-- usp_ProjectPermission_Set — replaces one person's permission overrides in one project (ADR-0024),
-- from the team's cog. @OverridesJson lists only the differences from their access level, e.g.
--   [{"module": "parking-lot", "verb": "create", "allowed": true},
--    {"module": "daily-activities", "verb": "delete", "allowed": false}]
--   * module: an overridable section (the list below = OVERRIDABLE_MODULES in src/lib/auth/rbac.ts;
--     the charter and the team never take overrides); verb: create, update or delete.
--   * Reading always follows the access level, so there is no "read" override.
-- Rules (each failure is VALIDATION 50004 unless noted):
--   * Manager on the project (FORBIDDEN_ROW 50003) — the people who manage the team.
--   * @UserId must be a live team member linked to that account (overrides belong to a membership;
--     dbo.usp_ProjectAssignee_Set deletes them when the person leaves).
--   * A non-Admin can't change their own overrides (no one widens or locks their own access).
--   * Each section and verb at most once.
-- Writes one audit row (EntityName app.ProjectPermissionOverride, EntityId '<ProjectId>:<UserId>').
-- Returns the person's overrides as saved (shape of dbo.usp_ProjectPermission_List).
-- Entity app.ProjectPermissionOverride. Module: projects (team permissions).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectPermission_Set
    @ProjectId     INT,
    @UserId        INT,
    @OverridesJson NVARCHAR(MAX),
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Manager';

    IF NOT EXISTS (SELECT 1 FROM app.ProjectAssignee
                   WHERE ProjectId = @ProjectId AND UserId = @UserId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:Only team members with an account can have permissions here', 1;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole <> N'Admin' AND @UserId = @ActorUserId
        THROW 50004, N'VALIDATION:You can''t change your own permissions', 1;

    IF @OverridesJson IS NULL OR ISJSON(@OverridesJson) <> 1 OR LEFT(LTRIM(@OverridesJson), 1) <> N'['
        THROW 50004, N'VALIDATION:Overrides must be a JSON array', 1;

    DECLARE @In TABLE ([Module] NVARCHAR(50) NULL, Verb NVARCHAR(10) NULL, Allowed BIT NULL);
    INSERT INTO @In ([Module], Verb, Allowed)
    SELECT j.[module], j.verb, j.allowed
    FROM OPENJSON(@OverridesJson)
         WITH ([module] NVARCHAR(50) '$.module', verb NVARCHAR(10) '$.verb', allowed BIT '$.allowed') j;

    IF EXISTS (SELECT 1 FROM @In
               WHERE Allowed IS NULL
                  OR Verb IS NULL OR Verb NOT IN (N'create', N'update', N'delete')
                  OR [Module] IS NULL
                  OR [Module] NOT IN (N'assumptions-constraints', N'daily-activities', N'key-deliverables',
                                      N'keywords', N'objectives', N'parking-lot', N'questions-answers',
                                      N'stakeholders', N'suppliers', N'todo-alerts', N'todo-items'))
        THROW 50004, N'VALIDATION:Each override needs a section, an action and allow or deny', 1;
    IF EXISTS (SELECT 1 FROM @In GROUP BY [Module], Verb HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:Each section and action can be set only once', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT [Module], Verb, Allowed FROM app.ProjectPermissionOverride
         WHERE ProjectId = @ProjectId AND UserId = @UserId ORDER BY [Module], Verb FOR JSON PATH);

    DELETE FROM app.ProjectPermissionOverride WHERE ProjectId = @ProjectId AND UserId = @UserId;

    INSERT INTO app.ProjectPermissionOverride (ProjectId, UserId, [Module], Verb, Allowed, CreatedBy)
    SELECT @ProjectId, @UserId, i.[Module], i.Verb, i.Allowed, @ActorUserId
    FROM @In i;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Set', N'app.ProjectPermissionOverride',
            CONCAT(@ProjectId, N':', @UserId), @Before,
            (SELECT [Module], Verb, Allowed FROM app.ProjectPermissionOverride
             WHERE ProjectId = @ProjectId AND UserId = @UserId ORDER BY [Module], Verb FOR JSON PATH));

    COMMIT;

    SELECT UserId, [Module], Verb, Allowed
    FROM app.ProjectPermissionOverride
    WHERE ProjectId = @ProjectId AND UserId = @UserId
    ORDER BY [Module], Verb;
END;
GO
