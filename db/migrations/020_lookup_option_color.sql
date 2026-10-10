-- 020_lookup_option_color.sql
-- Colour-coded dropdown values (ADR-0022 amendment, client feedback): each managed option may
-- carry a colour from a fixed palette (light/dark design tokens in globals.css, never raw
-- values), shown on its cells and badges; a list can also colour whole datasheet rows by
-- the row's value (e.g. every High-priority to-do). Both are edited in "Edit dropdown list".
--   app.LookupOption.Color  — red | orange | yellow | green | blue | purple | gray, NULL = none
--   app.LookupList.TintRows — 1 = rows take the colour of their value in this list
-- Starting colours (only where none is set yet): urgent priorities and high risk/impact red or
-- orange, with priority lists colouring rows; statuses colour their cells. Idempotent.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.LookupOption', N'Color') IS NULL
    ALTER TABLE app.LookupOption
        ADD Color VARCHAR(10) NULL
            CONSTRAINT CK_LookupOption_Color
            CHECK (Color IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'));
GO

IF COL_LENGTH(N'app.LookupList', N'TintRows') IS NULL
    ALTER TABLE app.LookupList
        ADD TintRows BIT NOT NULL
            CONSTRAINT DF_LookupList_TintRows DEFAULT 0;
GO

-- Starting colours: only lists nobody has coloured yet (re-running never overrides an Admin's choice).
DECLARE @Start TABLE (ListKey NVARCHAR(64) NOT NULL, Label NVARCHAR(50) NOT NULL, Color VARCHAR(10) NOT NULL);
INSERT INTO @Start (ListKey, Label, Color) VALUES
    (N'project.priority',             N'High',        'red'),
    (N'key-deliverable.priority',     N'Critical',    'red'),
    (N'key-deliverable.priority',     N'Important',   'orange'),
    (N'question-answer.priority',     N'Critical',    'red'),
    (N'question-answer.priority',     N'High',        'orange'),
    (N'todo-item.priority',           N'Critical',    'red'),
    (N'todo-item.priority',           N'High',        'orange'),
    (N'project.risk-level',           N'High',        'red'),
    (N'assumption-constraint.impact', N'High',        'red'),
    (N'project.status',               N'In progress', 'blue'),
    (N'project.status',               N'On hold',     'yellow'),
    (N'project.status',               N'Completed',   'green'),
    (N'project.status',               N'Cancelled',   'gray'),
    (N'key-deliverable.status',       N'In Progress', 'blue'),
    (N'key-deliverable.status',       N'On Hold',     'yellow'),
    (N'key-deliverable.status',       N'Completed',   'green'),
    (N'key-deliverable.status',       N'Cancelled',   'gray'),
    (N'daily-activity.status',        N'In Progress', 'blue'),
    (N'daily-activity.status',        N'Completed',   'green'),
    (N'daily-activity.status',        N'Cancelled',   'gray'),
    (N'todo-item.status',             N'In Progress', 'blue'),
    (N'todo-item.status',             N'In Review',   'purple'),
    (N'todo-item.status',             N'Completed',   'green'),
    (N'todo-item.status',             N'Cancelled',   'gray');

DECLARE @Coloured TABLE (ListKey NVARCHAR(64) NOT NULL);
UPDATE o SET Color = s.Color
OUTPUT inserted.ListKey INTO @Coloured (ListKey)
FROM app.LookupOption o
JOIN @Start s ON s.ListKey = o.ListKey AND s.Label = o.Label
WHERE o.IsDeleted = 0
  AND NOT EXISTS (SELECT 1 FROM app.LookupOption c WHERE c.ListKey = o.ListKey AND c.Color IS NOT NULL);

-- Priority lists coloured just now also colour their rows (a re-run colours nothing, so it
-- never turns rows back on after an Admin switched them off).
UPDATE app.LookupList SET TintRows = 1
WHERE ListKey IN (N'project.priority', N'key-deliverable.priority',
                  N'question-answer.priority', N'todo-item.priority')
  AND ListKey IN (SELECT ListKey FROM @Coloured);
GO
