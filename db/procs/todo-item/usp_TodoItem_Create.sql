-- usp_TodoItem_Create — insert one app.TodoItem row; row-level auth (project membership);
-- audits in-transaction; returns the new row.
-- THROW 50003 FORBIDDEN_ROW : actor is not a member of the given project (when ProjectId is supplied).
-- Entity app.TodoItem (source: tblTodoList). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Create
    @ProjectId         INT           = NULL,
    @DailyActivityId   INT           = NULL,
    @ProjectOrActivity NVARCHAR(50)  = NULL,
    @TodoItem          NVARCHAR(255) = NULL,
    @StartDate         DATETIME2     = NULL,
    @DueDate           DATETIME2     = NULL,
    @Priority          NVARCHAR(255) = NULL,
    @Status            NVARCHAR(255) = NULL,
    @Notes             NVARCHAR(MAX) = NULL,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Row-level auth: when creating under a project, actor must own/manage it or be Admin/PM.
    IF @ProjectId IS NOT NULL
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM auth.[User] u
            WHERE  u.UserId = @ActorUserId
              AND  u.RoleId IN (
                       SELECT RoleId FROM auth.[Role]
                       WHERE  Name IN (N'Admin', N'ProjectManager')
                   )
        )
        AND NOT EXISTS (
            SELECT 1 FROM app.TodoItem ti
            WHERE  ti.ProjectId = @ProjectId AND ti.CreatedBy = @ActorUserId AND ti.IsDeleted = 0
        )
        AND NOT EXISTS (
            SELECT 1 FROM app.Project p
            WHERE  p.ProjectId = @ProjectId
              AND  p.IsDeleted  = 0
              AND  p.CreatedBy  = @ActorUserId
        )
            THROW 50003, N'FORBIDDEN_ROW:You do not have access to this project', 1;
    END

    BEGIN TRAN;

    INSERT INTO app.TodoItem
        ([ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem],
         [StartDate], [DueDate], [Priority], [Status], [Notes], CreatedBy)
    VALUES
        (@ProjectId, @DailyActivityId, @ProjectOrActivity, @TodoItem,
         @StartDate, @DueDate, @Priority, @Status, @Notes, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.TodoItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity],
                    [TodoItem], [StartDate], [DueDate], [Priority], [Status], [Notes]
             FROM app.TodoItem WHERE TodoItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT TodoItemId,
           [ProjectId],
           [DailyActivityId],
           [ProjectOrActivity],
           [TodoItem],
           [StartDate],
           [DueDate],
           [Priority],
           [Status],
           [Notes],
           [SortKey],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @Id;
END;
GO
