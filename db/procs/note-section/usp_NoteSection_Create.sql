-- usp_NoteSection_Create — add a tab to a note (ADR-0053); audits in-transaction; returns the tab
-- and FirstPageId. Under the note's row lock (UPDLOCK, HOLDLOCK): the note's FIRST tab takes every
-- live page, so no page is left outside a tab (a note with no pages gets one, @PageTitle); a later
-- tab starts with one new page, @PageTitle, at the end of the note. The 500-page cap counts under
-- that lock, as usp_NoteTab_Create does.
-- Access: Contributor on the note's project, or a per-person grant (notes:create, ADR-0024).
-- VALIDATION 50004: a blank title or page title; a full note.
-- Entity app.NoteSection (tabs of pages). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteSection_Create
    @NoteId      INT,
    @Title       NVARCHAR(255) = NULL,
    @PageTitle   NVARCHAR(255) = NULL,
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
         @MinLevel = N'Contributor', @Permission = N'notes:create', @AllowProjectless = 1;

    SET @Title = NULLIF(TRIM(@Title), N'');
    SET @PageTitle = NULLIF(TRIM(@PageTitle), N'');
    IF @Title IS NULL OR @PageTitle IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = NoteId FROM app.Note WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    DECLARE @First BIT =
        CASE WHEN EXISTS (SELECT 1 FROM app.NoteSection WHERE NoteId = @NoteId AND IsDeleted = 0)
             THEN 0 ELSE 1 END;
    DECLARE @Pages INT = (SELECT COUNT(*) FROM app.NoteTab WHERE NoteId = @NoteId AND IsDeleted = 0);
    DECLARE @NewPage BIT = CASE WHEN @First = 1 AND @Pages > 0 THEN 0 ELSE 1 END;

    IF @NewPage = 1 AND @Pages >= 500
        THROW 50004, N'VALIDATION:A notebook holds at most 500 pages', 1;

    DECLARE @SortOrder INT =
        ISNULL((SELECT MAX([SortOrder]) FROM app.NoteSection WHERE NoteId = @NoteId AND IsDeleted = 0), 0) + 1;

    INSERT INTO app.NoteSection ([NoteId], [Title], [SortOrder], CreatedBy)
    VALUES (@NoteId, @Title, @SortOrder, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();
    DECLARE @FirstPageId INT;

    IF @NewPage = 0
    BEGIN
        UPDATE app.NoteTab SET
            NoteSectionId = @Id,
            UpdatedAtUtc  = SYSUTCDATETIME(),
            UpdatedBy     = @ActorUserId
        WHERE NoteId = @NoteId AND IsDeleted = 0;

        SELECT TOP (1) @FirstPageId = NoteTabId FROM app.NoteTab
        WHERE NoteId = @NoteId AND IsDeleted = 0
        ORDER BY [SortOrder], NoteTabId;
    END
    ELSE
    BEGIN
        DECLARE @PageSort INT =
            ISNULL((SELECT MAX([SortOrder]) FROM app.NoteTab WHERE NoteId = @NoteId AND IsDeleted = 0), 0) + 1;

        INSERT INTO app.NoteTab ([NoteId], NoteSectionId, [Title], [SortOrder], CreatedBy)
        VALUES (@NoteId, @Id, @PageTitle, @PageSort, @ActorUserId);

        SET @FirstPageId = SCOPE_IDENTITY();

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Create', N'app.NoteTab', CAST(@FirstPageId AS NVARCHAR(64)),
                (SELECT NoteTabId, [NoteId], NoteSectionId, [Title], [SortOrder]
                 FROM app.NoteTab WHERE NoteTabId = @FirstPageId
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.NoteSection', CAST(@Id AS NVARCHAR(64)),
            (SELECT s.NoteSectionId, s.[NoteId], s.[Title], s.[SortOrder],
                    (SELECT t.NoteTabId AS id FROM app.NoteTab AS t
                     WHERE t.NoteSectionId = s.NoteSectionId AND t.IsDeleted = 0
                     ORDER BY t.[SortOrder] FOR JSON PATH) AS Pages
             FROM app.NoteSection AS s WHERE s.NoteSectionId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT NoteSectionId,
           [NoteId],
           @RowProjectId AS ProjectId,
           [Title],
           [SortOrder],
           CAST(RowVer AS BIGINT) AS RowVer,
           @FirstPageId AS FirstPageId
    FROM app.NoteSection
    WHERE NoteSectionId = @Id;
END;
GO
