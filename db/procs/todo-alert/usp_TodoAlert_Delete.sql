-- usp_TodoAlert_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.TodoAlert (source: tblTodoList (alert engine columns, 1:1)). Module: database-schema-and-procs (#3).
-- THROW 50003 FORBIDDEN_ROW : actor is not the parent TodoItem owner nor Admin/ProjectManager.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_Delete
    @TodoAlertId INT,
    @RowVer BIGINT,
    @ActorUserId INT
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
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.TodoAlert WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoAlert not found', 1;
        THROW 50002, N'CONFLICT:TodoAlert was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.TodoAlert', CAST(@TodoAlertId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
