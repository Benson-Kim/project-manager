-- usp_NoteTab_Create — add a page at the end of a notebook (ADR-0035); audits in-transaction;
-- returns the new row. The project is the notebook's; the notebook row is locked (UPDLOCK,
-- HOLDLOCK) while the next SortOrder is taken, so two adds never share a place.
-- A notebook holds at most 500 live pages (VALIDATION 50004), counted under that lock: a reorder
-- names every page and takes at most 500, so a longer notebook could never be reordered.
-- Access: Contributor on the notebook's project, or a per-person grant (notes:create, ADR-0024).
-- A note with tabs (ADR-0053) needs @NoteSectionId, one of its live tabs; a note without tabs
-- needs it NULL. Checked under the same lock, so a tab added meanwhile cannot strand the page.
-- VALIDATION 50004: a blank title; a missing, foreign or needless tab.
-- Entity app.NoteTab (titled pages per checklist rows 17-20). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_Create
    @NoteId      INT,
    @Title         NVARCHAR(255) = NULL,
    @NoteSectionId INT = NULL,
    @ActorUserId   INT
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
         @MinLevel = N'Contributor', @Permission = N'notes:create', @AllowProjectless = 1;

    SET @Title = NULLIF(TRIM(@Title), N'');
    IF @Title IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = NoteId FROM app.Note WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    IF (SELECT COUNT(*) FROM app.NoteTab WHERE NoteId = @NoteId AND IsDeleted = 0) >= 500
        THROW 50004, N'VALIDATION:A notebook holds at most 500 pages', 1;

    IF EXISTS (SELECT 1 FROM app.NoteSection WHERE NoteId = @NoteId AND IsDeleted = 0)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.NoteSection
                       WHERE NoteSectionId = @NoteSectionId AND NoteId = @NoteId AND IsDeleted = 0)
            THROW 50004, N'VALIDATION:Pick a tab of this note', 1;
    END
    ELSE IF @NoteSectionId IS NOT NULL
        THROW 50004, N'VALIDATION:This note has no tabs', 1;

    DECLARE @SortOrder INT =
        ISNULL((SELECT MAX([SortOrder]) FROM app.NoteTab WHERE NoteId = @NoteId AND IsDeleted = 0), 0) + 1;

    INSERT INTO app.NoteTab ([NoteId], NoteSectionId, [Title], [SortOrder], CreatedBy)
    VALUES (@NoteId, @NoteSectionId, @Title, @SortOrder, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.NoteTab', CAST(@Id AS NVARCHAR(64)),
            (SELECT NoteTabId, [NoteId], NoteSectionId, [Title], [SortOrder]
             FROM app.NoteTab WHERE NoteTabId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT NoteTabId,
           [NoteId],
           NoteSectionId,
           @RowProjectId AS ProjectId,
           [Title],
           [Content],
           [SortOrder],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.NoteTab
    WHERE NoteTabId = @Id;
END;
GO
