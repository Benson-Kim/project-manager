-- 047_todo_item_assignee.sql — who is doing a to-do (client feedback 2026-10-26, raised twice;
-- ADR-0047 decision 3).
--   app.TodoItem.Assignee NVARCHAR(255) NULL: "The to-do list should have a column name assignee
--     in case you need to track who is doing a certain task."
--   Free text rather than a foreign key to app.Stakeholder, which is the opposite of the choice
--     migration 046 made for a meeting action, and for a reason: a stakeholder is a relationship
--     to a *project*, and a to-do need not have one. A personal to-do has no ProjectId (it may
--     hang off a DailyActivity instead, migration 014), so there is no project to resolve a
--     stakeholder against and no access rule that would make the id mean anything. The same shape
--     is already in the schema as app.QuestionAnswer.AssignedTo.
--   No CHECK: any name is a legitimate name, and an empty one is nobody — the procs fold empty
--     text to NULL so "" and NULL cannot both mean unassigned in stored data.
--   No index: Assignee is read with the row it belongs to. usp_TodoItem_List gains it as a search
--     column, but that search is a leading-wildcard LIKE which could not seek an index anyway, and
--     ADR-0016 caps the page, so the scan is bounded.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.TodoItem', N'Assignee') IS NULL
    ALTER TABLE app.TodoItem ADD [Assignee] NVARCHAR(255) NULL;
GO
