-- usp_NoteTab_Move — move a page to the end of another tab of its note (ADR-0053); RowVer-guarded
-- (CONFLICT 50002 when stale); audits in-transaction, under the note's row lock; returns the row.
-- Page SortOrder is note-wide, so the page takes the note's next SortOrder.
-- Access: Contributor on the note's project, or a per-person grant (notes:update, ADR-0024).
-- VALIDATION 50004: the target is not a live tab of the page's note, the page is already there,
-- or it is the last page of its tab (a tab keeps at least one page).
-- Entity app.NoteTab (titled pages per checklist rows 17-20). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_Move
    @NoteTabId     INT,
    @NoteSectionId INT,
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @NoteId INT;
    SELECT @RowProjectId = n.ProjectId, @NoteId = t.NoteId
    FROM app.NoteTab AS t
    JOIN app.Note AS n ON n.NoteId = t.NoteId AND n.IsDeleted = 0
    WHERE t.NoteTabId = @NoteTabId AND t.IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:NoteTab not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'notes:update', @AllowProjectless = 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = NoteId FROM app.Note WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    IF NOT EXISTS (SELECT 1 FROM app.NoteSection
                   WHERE NoteSectionId = @NoteSectionId AND NoteId = @NoteId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:Pick a tab of this note', 1;

    DECLARE @From INT = (SELECT NoteSectionId FROM app.NoteTab WHERE NoteTabId = @NoteTabId);
    IF @From IS NULL OR @From = @NoteSectionId
        THROW 50004, N'VALIDATION:Pick another tab', 1;

    IF NOT EXISTS (SELECT 1 FROM app.NoteTab
                   WHERE NoteSectionId = @From AND IsDeleted = 0 AND NoteTabId <> @NoteTabId)
        THROW 50004, N'VALIDATION:A tab keeps at least one page', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT NoteTabId, [NoteId], NoteSectionId, [SortOrder]
         FROM app.NoteTab WHERE NoteTabId = @NoteTabId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    DECLARE @SortOrder INT =
        ISNULL((SELECT MAX([SortOrder]) FROM app.NoteTab WHERE NoteId = @NoteId AND IsDeleted = 0), 0) + 1;

    UPDATE app.NoteTab SET
        NoteSectionId = @NoteSectionId,
        [SortOrder]   = @SortOrder,
        UpdatedAtUtc  = SYSUTCDATETIME(),
        UpdatedBy     = @ActorUserId
    WHERE NoteTabId = @NoteTabId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:NoteTab was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Move', N'app.NoteTab', CAST(@NoteTabId AS NVARCHAR(64)), @Before,
            (SELECT NoteTabId, [NoteId], NoteSectionId, [SortOrder]
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
