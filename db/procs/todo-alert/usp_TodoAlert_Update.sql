-- usp_TodoAlert_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.TodoAlert (source: tblTodoList (alert engine columns, 1:1)). Module: database-schema-and-procs (#3).
-- THROW 50003 FORBIDDEN_ROW : actor is not the parent TodoItem owner nor Admin/ProjectManager.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_Update
    @TodoAlertId INT,
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
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT;
    DECLARE @CurrentTodoItemId INT;
    SELECT @CurrentVer = CAST(a.RowVer AS BIGINT),
           @CurrentTodoItemId = a.TodoItemId
    FROM app.TodoAlert a
    WHERE a.TodoAlertId = @TodoAlertId AND a.IsDeleted = 0;

    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:TodoAlert not found', 1;

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
        WHERE TodoItemId = @CurrentTodoItemId
          AND IsDeleted = 0
          AND CreatedBy = @ActorUserId
    )
        THROW 50003, N'FORBIDDEN_ROW:You do not have access to this record', 1;
    IF @TodoItemId <> @CurrentTodoItemId
        THROW 50004, N'VALIDATION:TodoItemId cannot be changed', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:TodoAlert was modified by someone else', 1;

    -- Ownership guard: actor must own the parent TodoItem or be Admin/ProjectManager.
    IF NOT EXISTS (
        SELECT 1
        FROM   app.TodoAlert  a
        JOIN   app.TodoItem   ti ON ti.TodoItemId = a.TodoItemId AND ti.IsDeleted = 0
        WHERE  a.TodoAlertId = @TodoAlertId
          AND  a.IsDeleted   = 0
          AND  (
                   ti.CreatedBy = @ActorUserId
                   OR EXISTS (
                       SELECT 1 FROM auth.[User] u
                       WHERE  u.UserId = @ActorUserId
                         AND  u.RoleId IN (
                                  SELECT RoleId FROM auth.[Role]
                                  WHERE  Name IN (N'Admin', N'ProjectManager')
                              )
                   )
               )
    )
        THROW 50003, N'FORBIDDEN_ROW:You do not have access to this record', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoAlertId, [TodoItemId], [AlertDay], [AlertTime], [RepeatUnit], [RepeatInterval], [CurrentRepeatInterval], [SnoozeCount], [LastSnoozeTime], [MaxSnoozeCount], [SnoozeOptions], [IsDismissed]
         FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.TodoAlert SET
        [AlertDay] = @AlertDay,
        [AlertTime] = @AlertTime,
        [RepeatUnit] = @RepeatUnit,
        [RepeatInterval] = @RepeatInterval,
        [CurrentRepeatInterval] = @CurrentRepeatInterval,
        [SnoozeCount] = @SnoozeCount,
        [LastSnoozeTime] = @LastSnoozeTime,
        [MaxSnoozeCount] = @MaxSnoozeCount,
        [SnoozeOptions] = @SnoozeOptions,
        [IsDismissed] = @IsDismissed,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoAlert not found', 1;
        THROW 50002, N'CONFLICT:TodoAlert was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.TodoAlert', CAST(@TodoAlertId AS NVARCHAR(64)), @Before,
            (SELECT TodoAlertId, [TodoItemId], [AlertDay], [AlertTime], [RepeatUnit], [RepeatInterval], [CurrentRepeatInterval], [SnoozeCount], [LastSnoozeTime], [MaxSnoozeCount], [SnoozeOptions], [IsDismissed]
             FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
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
    WHERE TodoAlertId = @TodoAlertId;
END;
GO
