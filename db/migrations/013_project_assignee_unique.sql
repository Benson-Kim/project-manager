-- 013_project_assignee_unique.sql — add filtered unique index on app.ProjectAssignee.
-- Without this, usp_ProjectAssignee_Set can insert multiple active rows with the same
-- (ProjectId, Role, PersonName) if a forged or duplicated action payload is submitted,
-- producing phantom duplicates in the project details UI (C11-8 fix).
-- The index is filtered on IsDeleted = 0 so soft-deleted revoked entries do not block
-- new assignments with the same name/role on the same project (correct semantics).
-- Idempotent: wrapped in IF NOT EXISTS index check.
USE ProjectManager;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'app.ProjectAssignee')
      AND name = N'UIX_ProjectAssignee_Active'
)
    CREATE UNIQUE INDEX UIX_ProjectAssignee_Active
        ON app.ProjectAssignee (ProjectId, [Role], PersonName)
        WHERE IsDeleted = 0;
GO
