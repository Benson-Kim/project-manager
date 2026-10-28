-- usp_Board_ListAssignees — the people a card on this board may be assigned to: active users who
-- can reach the board. Feeds the card sheet's assignee picker.
-- Row-level access: dbo.usp_Board_AssertAccess at Viewer. A read passes no @Permission, so an
--   override can never widen it.
-- The list and the write agree by construction: this proc offers exactly the users
--   dbo.usp_BoardCard_AssertAssignee accepts — both ask dbo.ufn_AccessLevel_Resolve with
--   @AllowProjectless = 1, so on a standalone board (no project) every active user qualifies, and
--   on a project board only its assignees do. If the two ever diverge the picker would offer
--   someone the write then refuses, which is why the rule is written the same way in both.
-- Returns UserId and DisplayName only — no usernames, emails, roles or auth columns, as
--   dbo.usp_User_ListOptions does. Capped at 500 rows; @Search narrows it, with the LIKE
--   metacharacters escaped (docs/STANDARDS.md 2.3).
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_ListAssignees
    @BoardId     INT,
    @ActorUserId INT,
    @Search      NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    DECLARE @ProjectId INT;
    SELECT @ProjectId = ProjectId FROM app.Board WHERE BoardId = @BoardId AND IsDeleted = 0;

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

    SELECT TOP (500)
           u.UserId,
           u.DisplayName
    FROM auth.[User] u
    JOIN auth.Role r ON r.RoleId = u.RoleId
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(r.[Name], u.UserId, @ProjectId, 1) a
    WHERE u.IsActive = 1
      AND u.IsDeleted = 0
      AND a.AccessLevel IS NOT NULL
      AND (@Search IS NULL OR u.DisplayName LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY u.DisplayName ASC, u.UserId ASC;
END;
GO
