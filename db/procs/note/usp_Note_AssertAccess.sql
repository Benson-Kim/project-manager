-- usp_Note_AssertAccess — guard for procs that reach a note by id (its file
-- attachments): the note must exist and its project (or the project-less shared space) must grant
-- the actor @MinLevel, and @Permission when one is given.
-- THROW 50001 NOT_FOUND when the note is absent or deleted; 50003 FORBIDDEN_ROW otherwise.
-- Entity app.Note. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_AssertAccess
    @NoteId INT,
    @ActorUserId     INT,
    @MinLevel        NVARCHAR(20),
    @Permission      NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId INT;
    SELECT @ProjectId = ProjectId
    FROM app.Note
    WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    EXEC dbo.usp_Project_AssertAccess
        @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
        @MinLevel = @MinLevel, @AllowProjectless = 1, @Permission = @Permission;
END;
GO
