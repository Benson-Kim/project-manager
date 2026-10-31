-- usp_NoteTab_Update — save a page's title and content, with rowversion concurrency (50002 CONFLICT)
-- + in-transaction audit (ADR-0035). @Content is HTML the app has sanitised (ADR-0025);
-- @SearchText is its plain text, which usp_Note_List searches. The notebook is immutable.
-- Access: Contributor on the notebook's project, or a per-person grant (notes:update, ADR-0024).
-- VALIDATION 50004: a blank title.
-- Entity app.NoteTab (titled pages per checklist rows 17-20). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_Update
    @NoteTabId   INT,
    @Title       NVARCHAR(255) = NULL,
    @Content     NVARCHAR(MAX) = NULL,
    @SearchText  NVARCHAR(MAX) = NULL,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = n.ProjectId
    FROM app.NoteTab AS t
    JOIN app.Note AS n ON n.NoteId = t.NoteId AND n.IsDeleted = 0
    WHERE t.NoteTabId = @NoteTabId AND t.IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:NoteTab not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'notes:update', @AllowProjectless = 1;

    SET @Title = NULLIF(TRIM(@Title), N'');
    IF @Title IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT NoteTabId, [NoteId], [Title], [Content], [SortOrder]
         FROM app.NoteTab WHERE NoteTabId = @NoteTabId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.NoteTab SET
        [Title]      = @Title,
        [Content]    = @Content,
        [SearchText] = @SearchText,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE NoteTabId = @NoteTabId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.NoteTab WHERE NoteTabId = @NoteTabId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:NoteTab not found', 1;
        THROW 50002, N'CONFLICT:NoteTab was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.NoteTab', CAST(@NoteTabId AS NVARCHAR(64)), @Before,
            (SELECT NoteTabId, [NoteId], [Title], [Content], [SortOrder]
             FROM app.NoteTab WHERE NoteTabId = @NoteTabId
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
    WHERE NoteTabId = @NoteTabId;
END;
GO
