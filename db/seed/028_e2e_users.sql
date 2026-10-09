-- Seed (e2e ONLY): an Admin plus one test user per project access level, e2e- prefix, shared password from
-- the E2E_USER_PASSWORD env var (hashed by scripts/db-apply.sh, same mechanism
-- as 027). Applied only when E2E_SEED=1 — never on real environments.
-- MustChangePassword = 0 so login specs are not detoured. Idempotent.
-- Each e2e user is a global User except e2e-admin; their per-project access on
-- project 2 is seeded by 029_e2e_project_assignee.sql (ADR-0021).
-- Also seeds an overdue TodoItem + TodoAlert owned by e2e-pm (userId determined
-- at runtime) so the notifications bell test can verify the filled state.
USE ProjectManager;
GO
IF N'$(E2E_SEED)' = N'1' AND N'$(E2E_USER_PASSWORD_HASH)' <> N'__SKIP__'
BEGIN
    -- Users
    INSERT INTO auth.[User] (Username, PasswordHash, DisplayName, RoleId, MustChangePassword, CreatedBy)
    SELECT s.Username, N'$(E2E_USER_PASSWORD_HASH)', s.DisplayName, r.RoleId, 0, 0
    FROM (VALUES
        (N'e2e-admin', N'E2E Admin', N'Admin'),
        (N'e2e-pm', N'E2E Project Manager', N'User'),
        (N'e2e-contributor', N'E2E Contributor', N'User'),
        (N'e2e-viewer', N'E2E Viewer', N'User')
    ) AS s (Username, DisplayName, RoleName)
    JOIN auth.Role r ON r.Name = s.RoleName
    WHERE NOT EXISTS (SELECT 1 FROM auth.[User] u WHERE u.Username = s.Username AND u.IsDeleted = 0);

    -- TodoItem owned by e2e-pm: overdue, so the notifications bell shows filled.
    INSERT INTO app.TodoItem (ProjectId, DailyActivityId, ProjectOrActivity, TodoItem, StartDate, DueDate, Priority, Status, Notes, CreatedBy)
    SELECT NULL, NULL, N'None', N'E2E overdue alert', N'2024-12-01', N'2024-12-01', N'High', N'Not Started', NULL, u.UserId
    FROM auth.[User] u
    WHERE u.Username = N'e2e-pm' AND u.IsDeleted = 0
      AND NOT EXISTS (
          SELECT 1 FROM app.TodoItem t
          WHERE t.CreatedBy = u.UserId AND t.TodoItem = N'E2E overdue alert' AND t.IsDeleted = 0
      );

    -- TodoAlert on the e2e-pm overdue item (AlertDay in the past → overdue).
    INSERT INTO app.TodoAlert (TodoItemId, AlertDay, AlertTime, RepeatUnit, RepeatInterval, CurrentRepeatInterval, SnoozeCount, IsDismissed, CreatedBy)
    SELECT t.TodoItemId, N'2024-12-01', N'08:00:00', N'Day', 1, 0, 0, 0, u.UserId
    FROM app.TodoItem t
    JOIN auth.[User] u ON u.UserId = t.CreatedBy
    WHERE u.Username = N'e2e-pm' AND u.IsDeleted = 0
      AND t.TodoItem = N'E2E overdue alert' AND t.IsDeleted = 0
      AND NOT EXISTS (
          SELECT 1 FROM app.TodoAlert ta WHERE ta.TodoItemId = t.TodoItemId AND ta.IsDeleted = 0
      );
END;
GO
