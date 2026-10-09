-- usp_Permission_Require — the single write check of ADR-0021 + ADR-0024: the actor's access level
-- in the project, adjusted by their per-project permission override.
--   * @Permission ('<section>:create|update|delete') is passed by write procs of project sections.
--     When the actor is a non-Admin member of @ProjectId (a level was resolved) and has an override
--     for that section and verb in app.ProjectPermissionOverride, it decides: Allowed = 1 passes
--     (even below @MinLevel), Allowed = 0 fails with FORBIDDEN_ROW (even at or above it).
--   * Otherwise — no permission (reads, team and charter changes), a project-less record, an Admin, a
--     non-member, or no override — dbo.usp_AccessLevel_Require compares @Level with @MinLevel.
-- Callers: dbo.usp_Project_AssertAccess and the to-do access wrapper (dbo.usp_TodoItem_AssertAccess).
-- Module: access (ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Permission_Require
    @Level       NVARCHAR(20),
    @MinLevel    NVARCHAR(20),
    @ProjectId   INT,
    @ActorUserId INT,
    @ActorRole   NVARCHAR(50),
    @Permission  NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Permission IS NOT NULL AND @ProjectId IS NOT NULL AND @Level IS NOT NULL
       AND ISNULL(@ActorRole, N'') <> N'Admin'
    BEGIN
        DECLARE @Colon INT = CHARINDEX(N':', @Permission);
        DECLARE @Allowed BIT;
        SELECT @Allowed = o.Allowed
        FROM app.ProjectPermissionOverride o
        WHERE o.ProjectId = @ProjectId
          AND o.UserId = @ActorUserId
          AND o.[Module] = LEFT(@Permission, @Colon - 1)
          AND o.Verb = SUBSTRING(@Permission, @Colon + 1, 10);

        IF @Allowed = 1 RETURN;
        IF @Allowed = 0
            THROW 50003, N'FORBIDDEN_ROW:Your permissions in this project don''t allow this', 1;
    END;

    EXEC dbo.usp_AccessLevel_Require @Level = @Level, @MinLevel = @MinLevel;
END;
GO
