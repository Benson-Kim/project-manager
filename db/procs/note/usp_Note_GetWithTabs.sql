-- usp_Note_GetWithTabs — the notebook workspace (ADR-0035): one row, the notebook's columns plus
-- TabsJson, its live pages in SortOrder, and SectionsJson, its tabs in SortOrder (ADR-0053); each
-- FOR JSON PATH, INCLUDE_NULL_VALUES, NULL when empty.
-- Access: Viewer on the notebook's project (FORBIDDEN_ROW 50003); THROW 50001 when absent.
-- Entity app.Note (source: tblNotes). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_GetWithTabs
    @NoteId      INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Note WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 1;

    SELECT n.NoteId,
           n.[ProjectId],
           n.[Title],
           n.CreatedAtUtc,
           n.UpdatedAtUtc,
           CAST(n.RowVer AS BIGINT) AS RowVer,
           (SELECT t.NoteTabId,
                   t.[NoteId],
                   t.NoteSectionId,
                   n.[ProjectId] AS ProjectId,
                   t.[Title],
                   t.[Content],
                   t.[SortOrder],
                   t.CreatedAtUtc,
                   t.UpdatedAtUtc,
                   CAST(t.RowVer AS BIGINT) AS RowVer
            FROM app.NoteTab AS t
            WHERE t.NoteId = n.NoteId AND t.IsDeleted = 0
            ORDER BY t.[SortOrder], t.NoteTabId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS TabsJson,
           (SELECT s.NoteSectionId,
                   s.[NoteId],
                   s.[Title],
                   s.[SortOrder],
                   CAST(s.RowVer AS BIGINT) AS RowVer
            FROM app.NoteSection AS s
            WHERE s.NoteId = n.NoteId AND s.IsDeleted = 0
            ORDER BY s.[SortOrder], s.NoteSectionId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS SectionsJson
    FROM app.Note AS n
    WHERE n.NoteId = @NoteId AND n.IsDeleted = 0;
END;
GO
