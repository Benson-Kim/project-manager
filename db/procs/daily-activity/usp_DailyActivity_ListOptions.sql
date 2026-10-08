-- usp_DailyActivity_ListOptions
-- Lightweight option list for the "Link to daily activity" combobox inside
-- TodoItemSheet.  Returns only the columns needed for display + selection;
-- never the full row (see usp_DailyActivity_GetById for that).
--
-- Returns: DailyActivityId, Label ("Task (YYYY-MM-DD)" format).
-- Ordered:  RequestDate DESC so most-recent activities appear first.
-- Scope:    non-deleted rows; a supplied @ProjectId must be accessible
--           (dbo.usp_Project_AssertAccess → FORBIDDEN_ROW 50003); without one, only rows of
--           projects the actor is assigned to plus project-less rows (Admin sees all).
-- Auth:     @ActorUserId is validated as an active non-deleted user before
--           any data is returned (ADR-0012 row-level guard pattern).
-- Module:   todo-items (#24) / daily-activities (#19).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_ListOptions
    @ActorUserId INT,
    @ProjectId   INT          = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    -- Row-level actor guard (ADR-0012): reject deleted / inactive callers.
    IF NOT EXISTS (
        SELECT 1 FROM auth.[User]
        WHERE UserId = @ActorUserId AND IsActive = 1 AND IsDeleted = 0
    )
    BEGIN
        THROW 50003, 'UNAUTHENTICATED', 1;
    END;

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

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
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, da.ProjectId, 1) acc
    WHERE da.IsDeleted = 0
      AND (@ProjectId IS NULL OR da.ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
    ORDER BY da.RequestDate DESC, da.DailyActivityId DESC;
END;
GO
