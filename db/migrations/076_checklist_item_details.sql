-- 076_checklist_item_details.sql — A checklist item carries its own dates, assignee, priority and
-- notes, so it can reach the calendar and a board. The assignee is one of the project's stakeholders;
-- priority is a managed-list label, as on to-dos. Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.ChecklistItem', N'StartDate') IS NULL
    ALTER TABLE app.ChecklistItem ADD
        StartDate      DATE           NULL,
        DueDate        DATE           NULL,
        AssigneeStakeholderId INT     NULL CONSTRAINT FK_ChecklistItem_Assignee REFERENCES app.Stakeholder (StakeholderId),
        Priority       NVARCHAR(255)  NULL,
        Notes          NVARCHAR(MAX)  NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ChecklistItem_Dates')
    ALTER TABLE app.ChecklistItem ADD CONSTRAINT CK_ChecklistItem_Dates
        CHECK (StartDate IS NULL OR DueDate IS NULL OR StartDate <= DueDate);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ChecklistItem_Assignee'
                 AND object_id = OBJECT_ID(N'app.ChecklistItem'))
    CREATE INDEX IX_ChecklistItem_Assignee ON app.ChecklistItem (AssigneeStakeholderId, DueDate)
        WHERE IsDeleted = 0 AND AssigneeStakeholderId IS NOT NULL;
GO

IF COL_LENGTH(N'app.ChecklistItem', N'TodoItemId') IS NULL
    ALTER TABLE app.ChecklistItem ADD
        TodoItemId INT NULL CONSTRAINT FK_ChecklistItem_TodoItem REFERENCES app.TodoItem (TodoItemId);
GO

IF COL_LENGTH(N'app.TodoAlert', N'RecipientUserId') IS NULL
    ALTER TABLE app.TodoAlert ADD
        RecipientUserId INT NULL CONSTRAINT FK_TodoAlert_Recipient REFERENCES auth.[User] (UserId);
GO
