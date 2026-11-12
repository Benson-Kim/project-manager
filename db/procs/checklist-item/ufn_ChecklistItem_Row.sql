-- ufn_ChecklistItem_Row — one checklist row as every checklist-item proc answers it (ADR-0066):
--   the row, who ticked it, the actor's level and overrides on its project (ADR-0023, ADR-0024),
--   and its filled cells as JSON. A cell of a deleted column is left out; a to-do cell whose to-do
--   was deleted keeps only its column id, so the button offers a new to-do.
-- The caller has already checked access; this only reads.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_ChecklistItem_Row
(
    @ActorRole       NVARCHAR(50),
    @ActorUserId     INT,
    @ChecklistItemId INT
)
RETURNS TABLE
AS
RETURN
    SELECT i.ChecklistItemId,
           i.ChecklistId,
           i.ProjectId,
           i.Title,
           i.IsDone,
           i.DoneAtUtc,
           du.DisplayName AS DoneByName,
           i.SortOrder,
           i.CreatedAtUtc,
           CAST(i.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           (SELECT c.ChecklistColumnId AS columnId,
                   c.TextValue AS [text],
                   CONVERT(CHAR(10), c.DateValue, 23) AS [date],
                   c.LinkUrl AS link,
                   c.SignedAtUtc AS signedAt,
                   su.DisplayName AS signedBy,
                   t.TodoItemId AS todoId
            FROM app.ChecklistCell c
            JOIN app.ChecklistColumn col
              ON col.ChecklistColumnId = c.ChecklistColumnId AND col.IsDeleted = 0
            LEFT JOIN auth.[User] su ON su.UserId = c.SignedBy
            LEFT JOIN app.TodoItem t ON t.TodoItemId = c.TodoItemId AND t.IsDeleted = 0
            WHERE c.ChecklistItemId = i.ChecklistItemId
            FOR JSON PATH) AS Cells
    FROM app.ChecklistItem i
    LEFT JOIN auth.[User] du ON du.UserId = i.DoneBy
    OUTER APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, i.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, i.ProjectId, N'checklists') ov
    WHERE i.ChecklistItemId = @ChecklistItemId;
GO
