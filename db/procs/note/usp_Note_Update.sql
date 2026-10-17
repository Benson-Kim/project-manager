-- usp_Note_Update — rename a notebook, with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Access: Contributor on the notebook's project, or a per-person grant (notes:update, ADR-0024).
-- VALIDATION 50004: a blank title.
-- Entity app.Note (source: tblNotes). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_Update
    @NoteId      INT,
    @Title       NVARCHAR(255) = NULL,
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
         @MinLevel = N'Contributor', @Permission = N'notes:update', @AllowProjectless = 0;

    SET @Title = NULLIF(TRIM(@Title), N'');
    IF @Title IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT NoteId, [ProjectId], [Title]
         FROM app.Note WHERE NoteId = @NoteId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Note SET
        [Title]      = @Title,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE NoteId = @NoteId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Note WHERE NoteId = @NoteId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Note not found', 1;
        THROW 50002, N'CONFLICT:Note was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Note', CAST(@NoteId AS NVARCHAR(64)), @Before,
            (SELECT NoteId, [ProjectId], [Title]
             FROM app.Note WHERE NoteId = @NoteId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT NoteId,
           [ProjectId],
           [Title],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Note
    WHERE NoteId = @NoteId;
END;
GO
