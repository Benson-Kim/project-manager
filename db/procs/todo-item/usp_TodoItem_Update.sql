-- usp_TodoItem_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.TodoItem (source: tblTodoList (core; alert columns → TodoAlert)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Update
    @TodoItemId INT,
    @ProjectId INT = NULL,
    @DailyActivityId INT = NULL,
    @ProjectOrActivity NVARCHAR(50) = NULL,
    @TodoItem NVARCHAR(255) = NULL,
    @StartDate DATETIME2 = NULL,
    @DueDate DATETIME2 = NULL,
    @Priority NVARCHAR(255) = NULL,
    @Status NVARCHAR(255) = NULL,
    @Notes NVARCHAR(MAX) = NULL,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem], [StartDate], [DueDate], [Priority], [Status], [Notes]
         FROM app.TodoItem WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.TodoItem SET
        [ProjectId] = @ProjectId,
        [DailyActivityId] = @DailyActivityId,
        [ProjectOrActivity] = @ProjectOrActivity,
        [TodoItem] = @TodoItem,
        [StartDate] = @StartDate,
        [DueDate] = @DueDate,
        [Priority] = @Priority,
        [Status] = @Status,
        [Notes] = @Notes,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.TodoItem', CAST(@TodoItemId AS NVARCHAR(64)), @Before,
            (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem], [StartDate], [DueDate], [Priority], [Status], [Notes]
             FROM app.TodoItem WHERE TodoItemId = @TodoItemId
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
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId;
END;
GO
