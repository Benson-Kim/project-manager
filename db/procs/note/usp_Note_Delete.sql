-- usp_Note_Delete — soft-delete a notebook and its live pages, with rowversion concurrency +
-- in-transaction audit (ADR-0035).
-- Access: Manager on the notebook's project, or a per-person grant (notes:delete, ADR-0024).
-- Entity app.Note (source: tblNotes). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_Delete
    @NoteId      INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Note WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'notes:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT NoteId, [ProjectId], [Title]
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

    UPDATE app.NoteTab SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE NoteId = @NoteId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Note', CAST(@NoteId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
