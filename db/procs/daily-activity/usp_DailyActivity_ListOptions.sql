-- usp_DailyActivity_ListOptions
-- Lightweight option list for the "Link to daily activity" combobox inside
-- TodoItemSheet.  Returns only the columns needed for display + selection;
-- never the full row (see usp_DailyActivity_GetById for that).
--
-- Returns: DailyActivityId, Label ("Task (YYYY-MM-DD)" format).
-- Ordered:  RequestDate DESC so most-recent activities appear first.
-- Scope:    non-deleted rows; if @ProjectId is provided, scoped to that project.
-- Auth:     @ActorUserId is validated as an active non-deleted user before
--           any data is returned (ADR-0012 row-level guard pattern).
-- Module:   todo-items (#24) / daily-activities (#19).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_ListOptions
    @ActorUserId INT,
    @ProjectId   INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Row-level actor guard (ADR-0012): reject deleted / inactive callers.
    IF NOT EXISTS (
        SELECT 1 FROM auth.[User]
        WHERE UserId = @ActorUserId AND IsActive = 1 AND IsDeleted = 0
    )
    BEGIN
        THROW 50003, 'UNAUTHENTICATED', 1;
    END;

    SELECT
        da.DailyActivityId,
        -- Label format used by the UI combobox: "Task (YYYY-MM-DD)".
        -- Falls back to "(no task)" when Task is NULL or empty.
        CASE
            WHEN NULLIF(LTRIM(RTRIM(da.[Task])), '') IS NULL
                THEN N'(no task) (' + CONVERT(NVARCHAR(10), da.RequestDate, 23) + N')'
            ELSE
                LTRIM(RTRIM(da.[Task]))
                + N' (' + CONVERT(NVARCHAR(10), da.RequestDate, 23) + N')'
        END AS Label
    FROM app.DailyActivity da
    WHERE da.IsDeleted = 0
      AND (@ProjectId IS NULL OR da.ProjectId = @ProjectId)
    ORDER BY da.RequestDate DESC, da.DailyActivityId DESC;
END;
GO
