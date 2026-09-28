-- usp_Todo_Dismiss — mark a TodoAlert as dismissed (IsDismissed = 1).
-- Idempotent: dismissing an already-dismissed alert succeeds silently.
-- THROW 50001 when the alert does not exist (or is soft-deleted).
-- THROW 50002 when @RowVer mismatches (optimistic concurrency).
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

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0);

    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:TodoAlert not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:TodoAlert was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoAlertId, IsDismissed FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.TodoAlert
    SET    IsDismissed  = 1,
           UpdatedAtUtc = SYSUTCDATETIME(),
           UpdatedBy    = @ActorUserId
    WHERE  TodoAlertId = @TodoAlertId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Dismiss', N'app.TodoAlert', CAST(@TodoAlertId AS NVARCHAR(64)), @Before,
            (SELECT TodoAlertId, IsDismissed FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    -- Return the updated row so client can refresh RowVer.
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
