-- Seed app.TodoItem — ALL rows from docs/source/analysis/access-database.md §4 (tblTodoList (core; alert columns → TodoAlert)).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
-- Dual-purpose ProjectActivityID split into ProjectId / DailyActivityId; 0 or missing referent → NULL.
USE ProjectManager;
GO
SET IDENTITY_INSERT app.TodoItem ON;

INSERT INTO app.TodoItem ([TodoItemId], [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem], [StartDate], [DueDate], [Priority], [Status], [Notes], [CreatedBy])
SELECT s.*
FROM (VALUES
    (3, 14, NULL, N'Project', N'Create purchase orders table and queries', N'2024-12-27', N'2024-12-24', N'High', N'Not Started', NULL, 0),
    (4, NULL, 7, N'Daily Activity', N'Another To do Item', N'2024-12-27', N'2024-12-30', N'Critical', N'In Progress', NULL, 0),
    (6, 24, NULL, N'Project', N'Not Started', N'2024-12-27', N'2024-12-31', N'Medium', N'In Review', NULL, 0),
    (10, NULL, 7, N'Daily Activity', N'New To do Item', N'2024-12-28', N'2024-12-23', N'Critical', N'Completed', NULL, 0),
    (11, 2, NULL, N'Project', N'Relink new', N'2024-12-28', N'2024-12-29', N'Low', N'Cancelled', NULL, 0),
    (12, 2, NULL, N'Project', N'New todo meet today eveing', N'2024-12-28', N'2024-12-30', N'Medium', N'Cancelled', NULL, 0),
    (13, 8, NULL, N'Project', N'Edit Forms', N'2024-12-28', N'2024-12-30', N'High', N'Not Started', NULL, 0),
    (15, 2, NULL, N'Project', N'Backup all of my data especially proejects I am currently working on', N'2024-12-30', N'2024-12-31', N'Critical', N'Not Started', NULL, 0),
    (20, 15, NULL, N'Project', N'Test if the custom frontend works with the backend', N'2024-12-31', N'2024-12-31', N'Medium', N'In Progress', NULL, 0),
    (21, NULL, 2, N'Daily Activity', N'Edit budget-tracking excel forms', N'2024-12-24', N'2024-12-31', N'Medium', N'In Progress', NULL, 0),
    (22, NULL, NULL, N'None', N'Visit café for coffee', N'2024-12-30', N'2024-12-31', N'Medium', N'In Progress', NULL, 0),
    (23, 24, NULL, N'Project', N'Create flat tables', N'2024-12-29', N'2024-12-31', N'High', N'In Progress', NULL, 0),
    (25, 20, NULL, N'Project', N'Prepare Powerpoint slides for training the employees', N'2024-12-31', N'2025-01-01', N'Medium', N'Not Started', NULL, 0),
    (26, NULL, NULL, N'None', NULL, N'2025-01-02', N'2025-01-08', N'Medium', N'Not Started', NULL, 0),
    (27, NULL, NULL, N'Project', N'Create new slides', N'2025-01-01', N'2025-01-09', N'High', N'Not Started', NULL, 0),
    (28, NULL, NULL, N'Daily Activity', N'J', N'2025-01-08', N'2025-01-09', N'Medium', N'Completed', NULL, 0)
) AS s ([TodoItemId], [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem], [StartDate], [DueDate], [Priority], [Status], [Notes], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.TodoItem t WHERE t.[TodoItemId] = s.[TodoItemId]);

SET IDENTITY_INSERT app.TodoItem OFF;
GO
