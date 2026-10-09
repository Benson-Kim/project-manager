-- usp_TodoItem_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- THROW 50003 FORBIDDEN_ROW : to-do access rule (dbo.usp_TodoItem_AssertAccess, ADR-0021).
-- Entity app.TodoItem (source: tblTodoList (core; alert columns → TodoAlert)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Delete
    @TodoItemId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_TodoItem_AssertAccess
         @TodoItemId = @TodoItemId, @ActorUserId = @ActorUserId, @MinLevel = N'Manager';

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0);
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem], [StartDate], [DueDate], [Priority], [Status], [Notes]
         FROM app.TodoItem WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.TodoItem SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE TodoItemId = @TodoItemId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.TodoItem', CAST(@TodoItemId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
