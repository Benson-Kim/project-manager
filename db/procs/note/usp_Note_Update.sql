-- usp_Note_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.Note (source: tblNotes). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_Update
    @NoteId INT,
    @ProjectId INT,
    @Title NVARCHAR(255) = NULL,
    @Content NVARCHAR(MAX) = NULL,
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
        [ProjectId] = @ProjectId,
        [Title] = @Title,
        [Content] = @Content,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE NoteId = @NoteId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Note', CAST(@NoteId AS NVARCHAR(64)), @Before,
            (SELECT NoteId, [ProjectId], [Title], [Content]
             FROM app.Note WHERE NoteId = @NoteId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT NoteId,
           [ProjectId],
           [Title],
           [Content],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Note
    WHERE NoteId = @NoteId;
END;
GO
