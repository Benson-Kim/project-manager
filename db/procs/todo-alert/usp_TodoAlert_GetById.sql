-- usp_TodoAlert_GetById — fetch one active app.TodoAlert row; THROW 50001 when absent/soft-deleted.
-- Row-level access: the parent to-do's rule (dbo.usp_TodoAlert_AssertAccess, ADR-0021).
-- Entity app.TodoAlert (source: tblTodoList (alert engine columns, 1:1)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_TodoAlert_GetById
    @TodoAlertId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_TodoAlert_AssertAccess
         @TodoAlertId = @TodoAlertId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    SELECT TodoAlertId,
           [TodoItemId],
           [AlertDay],
           [AlertTime],
           [RepeatUnit],
           [RepeatInterval],
           [CurrentRepeatInterval],
           [SnoozeCount],
           [LastSnoozeTime],
           [MaxSnoozeCount],
           [SnoozeOptions],
           [IsDismissed],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.TodoAlert
    WHERE TodoAlertId = @TodoAlertId AND IsDeleted = 0;
END;
GO
