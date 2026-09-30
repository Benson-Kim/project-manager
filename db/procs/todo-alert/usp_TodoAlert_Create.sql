-- usp_TodoAlert_Create — insert one app.TodoAlert row; audits in-transaction; returns the new row.
-- Entity app.TodoAlert (source: tblTodoList (alert engine columns, 1:1)). Module: database-schema-and-procs (#3).
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
    IF NOT EXISTS (
        SELECT 1 FROM app.TodoItem
        WHERE TodoItemId = @TodoItemId AND IsDeleted = 0
    )
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;

    DECLARE @CanManageAll BIT = CASE WHEN EXISTS (
        SELECT 1
        FROM auth.[User] u
        INNER JOIN auth.[Role] r ON r.RoleId = u.RoleId
        WHERE u.UserId = @ActorUserId
          AND u.IsDeleted = 0
          AND u.IsActive = 1
          AND r.Name IN (N'Admin', N'ProjectManager')
    ) THEN 1 ELSE 0 END;

    IF @CanManageAll = 0 AND NOT EXISTS (
        SELECT 1 FROM app.TodoItem
        WHERE TodoItemId = @TodoItemId
          AND IsDeleted = 0
          AND CreatedBy = @ActorUserId
    )
        THROW 50003, N'FORBIDDEN_ROW:You do not have access to this record', 1;

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
