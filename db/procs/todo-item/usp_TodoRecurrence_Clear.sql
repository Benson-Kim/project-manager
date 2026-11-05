-- usp_TodoRecurrence_Clear — stops a to-do repeating (ADR-0059): deletes its occurrence rows, then its
-- rule (FK order), so it is a one-off again with its own dates. Checks and touches the to-do's RowVer,
-- the series' one token (see usp_TodoRecurrence_Set). The rule and the deleted rows go into the audit.
-- On a to-do that does not repeat only its RowVer moves (no audit row), so a repeated Clear is harmless.
-- THROW 50001 NOT_FOUND     : the to-do does not exist or is soft-deleted.
-- THROW 50002 CONFLICT      : RowVer mismatch.
-- THROW 50003 FORBIDDEN_ROW : to-do access rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
-- Module: todo-items.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoRecurrence_Clear
    @TodoItemId  INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'todo-items:update';

    BEGIN TRAN;

    UPDATE app.TodoItem SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE TodoItemId = @TodoItemId
      AND IsDeleted  = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;
    END

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT r.TodoItemId, r.RepeatUnit, r.RepeatEvery, r.StartTime, r.Weekdays, r.MonthMode, r.Ordinal,
                r.[Weekday], r.EndsOn, r.EndsAfter,
                (SELECT o.TodoOccurrenceId, o.OccursAt, o.[Status], o.MovedTo, o.IsSkipped
                 FROM app.TodoOccurrence o WHERE o.TodoItemId = r.TodoItemId
                 ORDER BY o.OccursAt FOR JSON PATH) AS RemovedOccurrences
         FROM app.TodoRecurrence r WITH (UPDLOCK, HOLDLOCK) WHERE r.TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    IF @Before IS NOT NULL
    BEGIN
        DELETE FROM app.TodoOccurrence WHERE TodoItemId = @TodoItemId;
        DELETE FROM app.TodoRecurrence WHERE TodoItemId = @TodoItemId;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
        VALUES (@ActorUserId, N'Delete', N'app.TodoRecurrence', CAST(@TodoItemId AS NVARCHAR(64)), @Before);
    END

    COMMIT;

    SELECT TodoItemId, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId;
END;
GO
