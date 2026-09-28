-- usp_Todo_Dismiss — mark a TodoAlert as dismissed (IsDismissed = 1).
-- Idempotent: dismissing an already-dismissed alert succeeds silently.
-- THROW 50001 NOT_FOUND     : alert does not exist or is soft-deleted.
-- THROW 50002 CONFLICT      : RowVer mismatch (atomic — checked in WHERE clause).
-- THROW 50003 FORBIDDEN_ROW : actor is not the item owner nor Admin/ProjectManager.
-- Audits the dismissal in-transaction.  Module: todo-alerts (#20).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Todo_Dismiss
    @TodoAlertId  INT,
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

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoAlertId, IsDismissed FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic RowVer check via WHERE clause.
    UPDATE app.TodoAlert
    SET    IsDismissed  = 1,
           UpdatedAtUtc = SYSUTCDATETIME(),
           UpdatedBy    = @ActorUserId
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
    VALUES (@ActorUserId, N'Dismiss', N'app.TodoAlert', CAST(@TodoAlertId AS NVARCHAR(64)), @Before,
            (SELECT TodoAlertId, IsDismissed FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
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
