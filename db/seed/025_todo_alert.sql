-- Seed app.TodoAlert — ALL rows from docs/source/analysis/access-database.md §4 (tblTodoList (alert engine columns, 1:1)).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
-- One row per source to-do with IsAlert = 1 (ids 3, 4, 21, 22).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.TodoAlert ON;

INSERT INTO app.TodoAlert ([TodoAlertId], [TodoItemId], [AlertDay], [AlertTime], [RepeatUnit], [RepeatInterval], [CurrentRepeatInterval], [SnoozeCount], [LastSnoozeTime], [MaxSnoozeCount], [SnoozeOptions], [IsDismissed], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 3, N'2025-01-05', N'02:36:00', N'Hour', 2, 45, 0, N'2025-10-07 17:09:43', 5, N'5', 0, 0),
    (2, 4, N'2025-01-05', N'08:20:00', N'Hour', 2, 45, 0, N'2025-10-07 17:09:43', 5, N'15', 0, 0),
    (3, 21, N'2025-01-05', N'04:00:00', N'Hour', 2, 45, 0, N'2025-10-07 17:09:43', NULL, NULL, 0, 0),
    (4, 22, N'2025-01-10', N'06:00:00', N'Hour', 3, 24, 0, N'2025-10-07 17:09:43', NULL, NULL, 0, 0)
) AS s ([TodoAlertId], [TodoItemId], [AlertDay], [AlertTime], [RepeatUnit], [RepeatInterval], [CurrentRepeatInterval], [SnoozeCount], [LastSnoozeTime], [MaxSnoozeCount], [SnoozeOptions], [IsDismissed], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.TodoAlert t WHERE t.[TodoAlertId] = s.[TodoAlertId]);

SET IDENTITY_INSERT app.TodoAlert OFF;
GO
