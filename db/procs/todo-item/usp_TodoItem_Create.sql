-- usp_TodoItem_Create — insert one app.TodoItem row; audits in-transaction; returns the new row.
-- Entity app.TodoItem (source: tblTodoList (core; alert columns → TodoAlert)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Create
    @ProjectId INT = NULL,
    @DailyActivityId INT = NULL,
    @ProjectOrActivity NVARCHAR(50) = NULL,
    @TodoItem NVARCHAR(255) = NULL,
    @StartDate DATETIME2 = NULL,
    @DueDate DATETIME2 = NULL,
    @Priority NVARCHAR(255) = NULL,
    @Status NVARCHAR(255) = NULL,
    @Notes NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    INSERT INTO app.TodoItem ([ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem], [StartDate], [DueDate], [Priority], [Status], [Notes], CreatedBy)
    VALUES (@ProjectId, @DailyActivityId, @ProjectOrActivity, @TodoItem, @StartDate, @DueDate, @Priority, @Status, @Notes, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.TodoItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem], [StartDate], [DueDate], [Priority], [Status], [Notes]
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
