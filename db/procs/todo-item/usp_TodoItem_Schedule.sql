-- usp_TodoItem_Schedule — places a to-do on the planner, moves or stretches it, or takes it off
--   (@ScheduledStart and @ScheduledEnd both NULL). Only the slot changes: the to-do's dates and
--   every other field stay as they are. Audits in-transaction; returns the slot and the new RowVer.
-- THROW 50001 NOT_FOUND  : row does not exist or is soft-deleted.
-- THROW 50002 CONFLICT   : RowVer mismatch (atomic via the WHERE clause).
-- THROW 50003 FORBIDDEN_ROW : to-do access rule at Contributor (dbo.usp_TodoItem_AssertAccess, ADR-0021).
-- THROW 50004 VALIDATION : dbo.usp_TodoItem_AssertSlot.
-- Module: todo-items.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Schedule
    @TodoItemId     INT,
    @ScheduledStart DATETIME2(0) = NULL,
    @ScheduledEnd   DATETIME2(0) = NULL,
    @RowVer         BIGINT,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Contributor', @Permission = N'todo-items:update';
    EXEC dbo.usp_TodoItem_AssertSlot @ScheduledStart = @ScheduledStart, @ScheduledEnd = @ScheduledEnd;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, ScheduledStart, ScheduledEnd
         FROM app.TodoItem WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.TodoItem SET
        ScheduledStart = @ScheduledStart,
        ScheduledEnd   = @ScheduledEnd,
        UpdatedAtUtc   = SYSUTCDATETIME(),
        UpdatedBy      = @ActorUserId
    WHERE TodoItemId = @TodoItemId
      AND IsDeleted  = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.TodoItem', CAST(@TodoItemId AS NVARCHAR(64)), @Before,
            (SELECT TodoItemId, ScheduledStart, ScheduledEnd
             FROM app.TodoItem WHERE TodoItemId = @TodoItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT TodoItemId, ScheduledStart, ScheduledEnd, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId;
END;
GO
