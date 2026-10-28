-- usp_BoardCard_AssertAssignee — one rule, in one place: a card may only be assigned to someone who
-- can reach the board. dbo.usp_BoardCard_Create and dbo.usp_BoardCard_Update both call it, and
-- dbo.usp_Board_ListAssignees offers exactly the users it accepts, so the picker and the write
-- never disagree. THROW 50004 VALIDATION when the user is inactive, unknown or has no access.
-- An internal helper, like dbo.usp_Board_AssertRoom:
--   * it asserts no access OF THE ACTOR — the caller has already locked the board and called
--     dbo.usp_Board_AssertAccess;
--   * it refuses to run outside a transaction, because the board's ProjectId (which decides the
--     answer) is only stable under the caller's lock;
--   * it reads the project FROM THE BOARD ROW, never from the caller.
--   EXEMPT in src/tests/proc-access-levels.test.ts for that reason.
-- The check is a point-in-time one, as the plan says: losing project access later does not
-- retroactively unassign a card. The board read shows the assignee either way.
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_AssertAssignee
    @BoardId        INT,
    @AssigneeUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:usp_BoardCard_AssertAssignee must run inside the caller''s transaction', 1;

    DECLARE @ProjectId INT;
    SELECT @ProjectId = ProjectId FROM app.Board WHERE BoardId = @BoardId AND IsDeleted = 0;

    IF NOT EXISTS (
        SELECT 1
        FROM auth.[User] u
        JOIN auth.Role r ON r.RoleId = u.RoleId
        CROSS APPLY dbo.ufn_AccessLevel_Resolve(r.[Name], u.UserId, @ProjectId, 1) a
        WHERE u.UserId = @AssigneeUserId
          AND u.IsActive = 1
          AND u.IsDeleted = 0
          AND a.AccessLevel IS NOT NULL)
        THROW 50004, N'VALIDATION:That person cannot be assigned work on this board', 1;
END;
GO
