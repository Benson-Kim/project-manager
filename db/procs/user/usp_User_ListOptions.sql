-- usp_User_ListOptions — pick-list of active user accounts for linking people to a project team
-- (ADR-0021). Returns only UserId and DisplayName: no usernames, emails, roles or auth columns.
-- Any active actor may call it (dbo.usp_User_GetActorRole rejects unknown or inactive callers);
-- adding someone to a team still requires Manager on that project (dbo.usp_ProjectAssignee_Set).
-- @Search matches DisplayName anywhere (LIKE wildcards escaped); capped at 500 rows (the team
-- editor loads the list once and filters it client-side).
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_ListOptions
    @ActorUserId INT,
    @Search      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_');

    SELECT TOP (500)
           UserId,
           DisplayName
    FROM auth.[User]
    WHERE IsActive = 1 AND IsDeleted = 0
      AND (@Search IS NULL OR DisplayName LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY DisplayName ASC, UserId ASC;
END;
GO
