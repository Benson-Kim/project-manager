-- usp_TodoItem_Update — full-row update with ATOMIC rowversion concurrency check (TOCTOU fix)
-- + in-transaction audit + row-level auth (FORBIDDEN_ROW).
-- THROW 50001 NOT_FOUND  : row does not exist or is soft-deleted.
-- THROW 50002 CONFLICT   : RowVer mismatch (check-then-update is atomic via WHERE clause).
-- THROW 50003 FORBIDDEN_ROW : actor is neither the creator nor a PM/Admin.
-- Entity app.TodoItem (source: tblTodoList). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoItem_Update
    @TodoItemId        INT,
    @ProjectId         INT          = NULL,
    @DailyActivityId   INT          = NULL,
    @ProjectOrActivity NVARCHAR(50) = NULL,
    @TodoItem          NVARCHAR(255) = NULL,
    @StartDate         DATETIME2    = NULL,
    @DueDate           DATETIME2    = NULL,
    @Priority          NVARCHAR(255) = NULL,
    @Status            NVARCHAR(255) = NULL,
    @Notes             NVARCHAR(MAX) = NULL,
    @RowVer            BIGINT,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

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
                                  WHERE  RoleName IN (N'Admin', N'ProjectManager')
                              )
                   )
               )
    )
    BEGIN
        -- Distinguish NOT_FOUND from FORBIDDEN_ROW so the caller gets the right error code.
        IF NOT EXISTS (SELECT 1 FROM app.TodoItem WHERE TodoItemId = @TodoItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:TodoItem not found', 1;
        THROW 50003, N'FORBIDDEN_ROW:You do not have access to this record', 1;
    END

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem],
                [StartDate], [DueDate], [Priority], [Status], [Notes]
         FROM app.TodoItem WHERE TodoItemId = @TodoItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    -- Atomic RowVer check: include RowVer in the WHERE clause.
    -- If the row was modified between our auth check and here, @@ROWCOUNT = 0.
    UPDATE app.TodoItem SET
        [ProjectId]         = @ProjectId,
        [DailyActivityId]   = @DailyActivityId,
        [ProjectOrActivity] = @ProjectOrActivity,
        [TodoItem]          = @TodoItem,
        [StartDate]         = @StartDate,
        [DueDate]           = @DueDate,
        [Priority]          = @Priority,
        [Status]            = @Status,
        [Notes]             = @Notes,
        UpdatedAtUtc        = SYSUTCDATETIME(),
        UpdatedBy           = @ActorUserId
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
            (SELECT TodoItemId, [ProjectId], [DailyActivityId], [ProjectOrActivity], [TodoItem],
                    [StartDate], [DueDate], [Priority], [Status], [Notes]
             FROM app.TodoItem WHERE TodoItemId = @TodoItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT TodoItemId,
           [ProjectId],
           [DailyActivityId],
           [ProjectOrActivity],
           [TodoItem],
           [StartDate],
           [DueDate],
           [Priority],
           [Status],
           [Notes],
           [SortKey],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoItem
    WHERE TodoItemId = @TodoItemId;
END;
GO
