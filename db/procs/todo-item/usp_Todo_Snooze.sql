-- usp_Todo_Snooze — snooze the linked TodoAlert by @SnoozeMinutes; increments SnoozeCount;
-- enforces MaxSnoozeCount (THROW 50004 when limit reached); updates LastSnoozeTime to now.
-- The TodoItem row is identified via the TodoAlert (FK TodoItemId); @RowVer is the TodoAlert's RowVer.
-- THROW 50001 when the alert does not exist or belongs to a different user's project.
-- THROW 50002 when @RowVer mismatches (optimistic concurrency on TodoAlert).
-- THROW 50004 when SnoozeCount >= MaxSnoozeCount (MaxSnoozeCount NOT NULL only).
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

    DECLARE @CurrentVer    BIGINT;
    DECLARE @SnoozeCount   INT;
    DECLARE @MaxSnoozeCount INT;

    SELECT @CurrentVer     = CAST(a.RowVer AS BIGINT),
           @SnoozeCount    = a.SnoozeCount,
           @MaxSnoozeCount = a.MaxSnoozeCount
    FROM app.TodoAlert a
    WHERE a.TodoAlertId = @TodoAlertId AND a.IsDeleted = 0;

    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:TodoAlert not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:TodoAlert was modified by someone else', 1;
    IF @MaxSnoozeCount IS NOT NULL AND ISNULL(@SnoozeCount, 0) >= @MaxSnoozeCount
        THROW 50004, N'VALIDATION:Maximum snooze count reached', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoAlertId, SnoozeCount, LastSnoozeTime, AlertDay, AlertTime
         FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.TodoAlert
    SET    SnoozeCount     = ISNULL(SnoozeCount, 0) + 1,
           LastSnoozeTime  = SYSUTCDATETIME(),
           -- Push the alert forward by @SnoozeMinutes from now
           AlertDay        = CAST(DATEADD(MINUTE, @SnoozeMinutes, SYSUTCDATETIME()) AS DATE),
           AlertTime       = CAST(DATEADD(MINUTE, @SnoozeMinutes, SYSUTCDATETIME()) AS TIME(0)),
           UpdatedAtUtc    = SYSUTCDATETIME(),
           UpdatedBy       = @ActorUserId
    WHERE  TodoAlertId = @TodoAlertId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Snooze', N'app.TodoAlert', CAST(@TodoAlertId AS NVARCHAR(64)), @Before,
            (SELECT TodoAlertId, SnoozeCount, LastSnoozeTime, AlertDay, AlertTime
             FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    -- Return the updated TodoAlert row.
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
