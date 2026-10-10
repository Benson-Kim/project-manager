-- usp_TodoAlert_Create — insert one app.TodoAlert row; audits in-transaction; returns the new row.
-- Entity app.TodoAlert (source: tblTodoList (alert engine columns, 1:1)). Module: database-schema-and-procs (#3).
-- THROW 50001 NOT_FOUND     : @TodoItemId does not exist or is soft-deleted.
-- THROW 50003 FORBIDDEN_ROW : to-do access rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_Create
    @TodoItemId INT,
    @AlertDay DATETIME2 = NULL,
    @AlertTime TIME(0) = NULL,
    @RepeatUnit NVARCHAR(50) = NULL,
    @RepeatInterval INT = NULL,
    @CurrentRepeatInterval INT = NULL,
    @SnoozeCount INT = NULL,
    @LastSnoozeTime DATETIME2 = NULL,
    @MaxSnoozeCount INT = NULL,
    @SnoozeOptions NVARCHAR(255) = NULL,
    @IsDismissed BIT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @TodoItemId IS NULL
        THROW 50004, N'VALIDATION:TodoItemId is required', 1;


    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'todo-alerts:create';

    BEGIN TRAN;

    INSERT INTO app.TodoAlert ([TodoItemId], [AlertDay], [AlertTime], [RepeatUnit], [RepeatInterval], [CurrentRepeatInterval], [SnoozeCount], [LastSnoozeTime], [MaxSnoozeCount], [SnoozeOptions], [IsDismissed], CreatedBy)
    VALUES (@TodoItemId, @AlertDay, @AlertTime, @RepeatUnit, @RepeatInterval, @CurrentRepeatInterval, @SnoozeCount, @LastSnoozeTime, @MaxSnoozeCount, @SnoozeOptions, @IsDismissed, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.TodoAlert', CAST(@Id AS NVARCHAR(64)),
            (SELECT TodoAlertId, [TodoItemId], [AlertDay], [AlertTime], [RepeatUnit], [RepeatInterval], [CurrentRepeatInterval], [SnoozeCount], [LastSnoozeTime], [MaxSnoozeCount], [SnoozeOptions], [IsDismissed]
             FROM app.TodoAlert WHERE TodoAlertId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT TodoAlertId,
           [TodoItemId],
           [AlertDay],
           [AlertTime],
           [RepeatUnit],
           [RepeatInterval],
           [CurrentRepeatInterval],
           [SnoozeCount],
           [LastSnoozeTime],
           [MaxSnoozeCount],
           [SnoozeOptions],
           [IsDismissed],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoAlert
    WHERE TodoAlertId = @Id;
END;
GO
