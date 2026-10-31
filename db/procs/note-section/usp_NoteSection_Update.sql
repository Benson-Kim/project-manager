-- usp_NoteSection_Update — rename a tab (ADR-0053); RowVer-guarded (CONFLICT 50002 when stale);
-- audits in-transaction; returns the row. The project is the tab's note's.
-- Access: Contributor on the note's project, or a per-person grant (notes:update, ADR-0024).
-- VALIDATION 50004: a blank title.
-- Entity app.NoteSection (tabs of pages). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteSection_Update
    @NoteSectionId INT,
    @Title         NVARCHAR(255) = NULL,
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = n.ProjectId
    FROM app.NoteSection AS s
    JOIN app.Note AS n ON n.NoteId = s.NoteId AND n.IsDeleted = 0
    WHERE s.NoteSectionId = @NoteSectionId AND s.IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:NoteSection not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'notes:update', @AllowProjectless = 1;

    SET @Title = NULLIF(TRIM(@Title), N'');
    IF @Title IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT NoteSectionId, [NoteId], [Title], [SortOrder]
         FROM app.NoteSection WHERE NoteSectionId = @NoteSectionId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.NoteSection SET
        [Title]      = @Title,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE NoteSectionId = @NoteSectionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.NoteSection WHERE NoteSectionId = @NoteSectionId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:NoteSection not found', 1;
        THROW 50002, N'CONFLICT:NoteSection was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.NoteSection', CAST(@NoteSectionId AS NVARCHAR(64)), @Before,
            (SELECT NoteSectionId, [NoteId], [Title], [SortOrder]
             FROM app.NoteSection WHERE NoteSectionId = @NoteSectionId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT NoteSectionId,
           [NoteId],
           @RowProjectId AS ProjectId,
           [Title],
           [SortOrder],
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.NoteSection
    WHERE NoteSectionId = @NoteSectionId;
END;
GO
