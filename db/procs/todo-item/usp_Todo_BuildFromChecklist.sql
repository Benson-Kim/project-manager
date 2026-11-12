-- usp_Todo_BuildFromChecklist — the "Create to-do" button of a checklist row (ADR-0066).
-- Copies the row's title -> TodoItem, and the first date the row holds (in column order) -> DueDate;
--   ProjectId is the checklist's. The cell keeps the to-do, so a second press finds the first
--   instead of adding another; when that to-do was deleted, the press makes a new one.
-- Access: Contributor + todo-items:create on the checklist's project (the row is read under it).
-- THROW 50001 NOT_FOUND  : the row or the column is gone.
-- THROW 50004 VALIDATION : the column is not a to-do button.
-- Bumps the row's RowVer and answers with the row (ufn_ChecklistItem_Row). Audits both rows.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_BuildFromChecklist
    @ChecklistItemId   INT,
    @ChecklistColumnId INT,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT =
        (SELECT ProjectId FROM app.ChecklistItem WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0);
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Row not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'todo-items:create', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @ChecklistId INT, @Title NVARCHAR(400);
    SELECT @ChecklistId = ChecklistId, @Title = Title
    FROM app.ChecklistItem WITH (UPDLOCK, HOLDLOCK)
    WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0;
    IF @ChecklistId IS NULL
        THROW 50001, N'NOT_FOUND:Row not found', 1;

    IF NOT EXISTS (SELECT 1 FROM app.ChecklistColumn
                   WHERE ChecklistColumnId = @ChecklistColumnId AND ChecklistId = @ChecklistId
                     AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Column not found', 1;
    IF NOT EXISTS (SELECT 1 FROM app.ChecklistColumn
                   WHERE ChecklistColumnId = @ChecklistColumnId AND Kind = 'action' AND ActionKind = 'todo')
        THROW 50004, N'VALIDATION:This column does not make to-dos', 1;

    DECLARE @Existing INT;
    SELECT @Existing = t.TodoItemId
    FROM app.ChecklistCell c
    JOIN app.TodoItem t ON t.TodoItemId = c.TodoItemId AND t.IsDeleted = 0
    WHERE c.ChecklistItemId = @ChecklistItemId AND c.ChecklistColumnId = @ChecklistColumnId;

    IF @Existing IS NULL
    BEGIN
        DECLARE @Due DATE = (
            SELECT TOP (1) c.DateValue
            FROM app.ChecklistCell c
            JOIN app.ChecklistColumn col ON col.ChecklistColumnId = c.ChecklistColumnId
            WHERE c.ChecklistItemId = @ChecklistItemId AND col.IsDeleted = 0 AND col.Kind = 'date'
              AND c.DateValue IS NOT NULL
            ORDER BY col.SortOrder, col.ChecklistColumnId);

        INSERT INTO app.TodoItem ([ProjectId], [TodoItem], [DueDate], [Status], CreatedBy)
        VALUES (@ProjectId, LEFT(@Title, 255), @Due, N'Not Started', @ActorUserId);
        DECLARE @TodoId INT = SCOPE_IDENTITY();

        UPDATE app.ChecklistCell SET TodoItemId = @TodoId, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE ChecklistItemId = @ChecklistItemId AND ChecklistColumnId = @ChecklistColumnId;
        IF @@ROWCOUNT = 0
            INSERT INTO app.ChecklistCell (ChecklistItemId, ChecklistColumnId, ChecklistId, TodoItemId, UpdatedBy)
            VALUES (@ChecklistItemId, @ChecklistColumnId, @ChecklistId, @TodoId, @ActorUserId);

        UPDATE app.ChecklistItem SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE ChecklistItemId = @ChecklistItemId;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'BuildFromChecklist', N'app.TodoItem', CAST(@TodoId AS NVARCHAR(64)),
                (SELECT @TodoId AS TodoItemId, @ProjectId AS ProjectId, LEFT(@Title, 255) AS TodoItem,
                        @Due AS DueDate, N'Not Started' AS [Status]
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Update', N'app.ChecklistCell',
                CAST(@ChecklistItemId AS NVARCHAR(30)) + N':' + CAST(@ChecklistColumnId AS NVARCHAR(30)),
                (SELECT @TodoId AS todoId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT * FROM dbo.ufn_ChecklistItem_Row(@ActorRole, @ActorUserId, @ChecklistItemId);
END;
GO
