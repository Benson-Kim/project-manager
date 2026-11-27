-- 096_note_file.sql — a note's file attachments, so a picture pasted into a note is kept with it.
-- app.NoteFile links app.Note to app.FileAttachment, the same shared store every other owner uses
-- (see 022). A note holds many attachments; an attachment belongs to one note (UQ on
-- FileAttachmentId). Additive and idempotent.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.NoteFile', N'U') IS NULL
BEGIN
    CREATE TABLE app.NoteFile (
        NoteId           INT NOT NULL
            CONSTRAINT FK_NoteFile_Note REFERENCES app.Note (NoteId),
        FileAttachmentId INT NOT NULL
            CONSTRAINT FK_NoteFile_FileAttachment REFERENCES app.FileAttachment (FileAttachmentId),
        CONSTRAINT PK_NoteFile PRIMARY KEY (NoteId, FileAttachmentId),
        CONSTRAINT UQ_NoteFile_FileAttachment UNIQUE (FileAttachmentId)
    );
END;
GO
