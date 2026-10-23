-- usp_NoteTab_GetById — fetch one live page of a live notebook; THROW 50001 when absent.
-- Access: Viewer on the notebook's project (FORBIDDEN_ROW 50003).
-- Entity app.NoteTab (titled pages per checklist rows 17-20). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_GetById
    @NoteTabId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = n.ProjectId
    FROM app.NoteTab AS t
    JOIN app.Note AS n ON n.NoteId = t.NoteId AND n.IsDeleted = 0
    WHERE t.NoteTabId = @NoteTabId AND t.IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:NoteTab not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT NoteTabId,
           [NoteId],
           @RowProjectId AS ProjectId,
           [Title],
           [Content],
           [SortOrder],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.NoteTab
    WHERE NoteTabId = @NoteTabId AND IsDeleted = 0;
END;
GO
