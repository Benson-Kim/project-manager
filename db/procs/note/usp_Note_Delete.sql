-- usp_Note_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.Note (source: tblNotes). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_Delete
    @NoteId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Note WHERE NoteId = @NoteId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Note not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Note was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT NoteId, [ProjectId], [Title], [Content]
         FROM app.Note WHERE NoteId = @NoteId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Note SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE NoteId = @NoteId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Note WHERE NoteId = @NoteId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Note not found', 1;
        THROW 50002, N'CONFLICT:Note was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Note', CAST(@NoteId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
