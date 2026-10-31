-- usp_NoteTab_List — the live pages of one notebook in SortOrder (ADR-0035).
-- Access: Viewer on the notebook's project (FORBIDDEN_ROW 50003); THROW 50001 when the notebook
--   is absent.
-- Entity app.NoteTab (titled pages per checklist rows 17-20). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_List
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

    SELECT NoteTabId,
           [NoteId],
           NoteSectionId,
           @RowProjectId AS ProjectId,
           [Title],
           [Content],
           [SortOrder],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.NoteTab
    WHERE NoteId = @NoteId AND IsDeleted = 0
    ORDER BY [SortOrder], NoteTabId;
END;
GO
