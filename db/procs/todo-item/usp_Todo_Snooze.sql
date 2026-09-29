-- usp_Todo_Snooze — snooze the linked TodoAlert by @SnoozeMinutes; increments SnoozeCount;
-- enforces MaxSnoozeCount (THROW 50004); updates LastSnoozeTime to now.
-- THROW 50001 NOT_FOUND        : alert does not exist or is soft-deleted.
-- THROW 50002 CONFLICT         : RowVer mismatch (atomic — checked in WHERE clause).
-- THROW 50003 FORBIDDEN_ROW    : actor is not the item owner nor Admin/ProjectManager.
-- THROW 50004 MAX_SNOOZE       : SnoozeCount >= MaxSnoozeCount.
-- Audits the snooze in-transaction.  Module: todo-alerts (#20).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_Snooze
    @TodoAlertId  INT,
    @SnoozeMinutes INT,
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Row-level auth: actor must own the parent TodoItem or be Admin/PM.
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
                                  WHERE  RoleName IN (N'Admin', N'ProjectManager')
                              )
                   )
               )
    )
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoAlert not found', 1;
        THROW 50003, N'FORBIDDEN_ROW:You do not have access to this record', 1;
    END

    -- MaxSnoozeCount guard (read outside the transaction — safe; only enforces business rule).
    DECLARE @SnoozeCount    INT;
    DECLARE @MaxSnoozeCount INT;
    SELECT @SnoozeCount    = SnoozeCount,
           @MaxSnoozeCount = MaxSnoozeCount
    FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0;

    IF @MaxSnoozeCount IS NOT NULL AND ISNULL(@SnoozeCount, 0) >= @MaxSnoozeCount
        THROW 50004, N'VALIDATION:Maximum snooze count reached', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoAlertId, SnoozeCount, LastSnoozeTime, AlertDay, AlertTime
         FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic RowVer check via WHERE clause.
    UPDATE app.TodoAlert
    SET    SnoozeCount     = ISNULL(SnoozeCount, 0) + 1,
           LastSnoozeTime  = SYSUTCDATETIME(),
           AlertDay        = CAST(DATEADD(MINUTE, @SnoozeMinutes, SYSUTCDATETIME()) AS DATE),
           AlertTime       = CAST(DATEADD(MINUTE, @SnoozeMinutes, SYSUTCDATETIME()) AS TIME(0)),
           UpdatedAtUtc    = SYSUTCDATETIME(),
           UpdatedBy       = @ActorUserId
    WHERE  TodoAlertId = @TodoAlertId
      AND  IsDeleted   = 0
      AND  CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoAlert not found', 1;
        THROW 50002, N'CONFLICT:TodoAlert was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Snooze', N'app.TodoAlert', CAST(@TodoAlertId AS NVARCHAR(64)), @Before,
            (SELECT TodoAlertId, SnoozeCount, LastSnoozeTime, AlertDay, AlertTime
             FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT TodoAlertId,
           TodoItemId,
           AlertDay,
           CONVERT(VARCHAR(8), AlertTime, 108) AS AlertTime,
           RepeatUnit,
           RepeatInterval,
           CurrentRepeatInterval,
           SnoozeCount,
           LastSnoozeTime,
           MaxSnoozeCount,
           SnoozeOptions,
           IsDismissed,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoAlert
    WHERE TodoAlertId = @TodoAlertId;
END;
GO
