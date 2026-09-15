-- usp_Note_GetById — fetch one active app.Note row; THROW 50001 when absent/soft-deleted.
-- Entity app.Note (source: tblNotes). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_GetById
    @NoteId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Note WHERE NoteId = @NoteId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    SELECT NoteId,
           [ProjectId],
           [Title],
           [Content],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Note
    WHERE NoteId = @NoteId AND IsDeleted = 0;
END;
GO
