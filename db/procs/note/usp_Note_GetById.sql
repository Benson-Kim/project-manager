-- usp_Note_GetById — fetch one live notebook; THROW 50001 when absent/soft-deleted.
-- Access: Viewer on the notebook's project (FORBIDDEN_ROW 50003).
-- Entity app.Note (source: tblNotes). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_GetById
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
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    SELECT NoteId,
           [ProjectId],
           [Title],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Note
    WHERE NoteId = @NoteId AND IsDeleted = 0;
END;
GO
