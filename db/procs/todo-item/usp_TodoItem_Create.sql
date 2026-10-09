-- usp_TodoItem_Create — insert one app.TodoItem row; row-level auth (project membership);
-- audits in-transaction; returns the new row.
-- THROW 50003 FORBIDDEN_ROW : no Contributor access to @ProjectId, or @DailyActivityId unreadable (ADR-0021).
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

    -- Row-level access (ADR-0021): a project to-do needs Contributor there (project-less
    -- to-dos are personal); a linked activity must be readable.
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @AllowProjectless = 1;
    IF @DailyActivityId IS NOT NULL
        EXEC dbo.usp_DailyActivity_AssertAccess
             @DailyActivityId = @DailyActivityId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

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
