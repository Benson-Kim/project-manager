-- usp_TodoItem_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- THROW 50003 FORBIDDEN_ROW : actor is not the TodoItem creator nor Admin/ProjectManager.
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

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:TodoItem was modified by someone else', 1;

    -- Row-level auth: actor must be the creator OR hold Admin/ProjectManager role.
    IF NOT EXISTS (
        SELECT 1 FROM app.TodoItem ti
        WHERE  ti.TodoItemId = @TodoItemId
          AND  ti.IsDeleted  = 0
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
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50003, N'FORBIDDEN_ROW:You do not have access to this record', 1;
    END

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
