-- usp_NoteSection_Delete — soft-delete a tab and every page in it (ADR-0053); RowVer-guarded
-- (CONFLICT 50002 when stale); audits in-transaction, under the note's row lock. A note's only
-- tab is refused (VALIDATION 50004): deleting it would leave a note with tabs and no tab;
-- usp_NoteSection_Ungroup removes the tabs and keeps the pages.
-- Access: Manager on the note's project, or a per-person grant (notes:delete, ADR-0024).
-- Entity app.NoteSection (tabs of pages). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteSection_Delete
    @NoteSectionId INT,
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @NoteId INT;
    SELECT @RowProjectId = n.ProjectId, @NoteId = s.NoteId
    FROM app.NoteSection AS s
    JOIN app.Note AS n ON n.NoteId = s.NoteId AND n.IsDeleted = 0
    WHERE s.NoteSectionId = @NoteSectionId AND s.IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:NoteSection not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'notes:delete', @AllowProjectless = 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = NoteId FROM app.Note WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    IF NOT EXISTS (SELECT 1 FROM app.NoteSection
                   WHERE NoteId = @NoteId AND IsDeleted = 0 AND NoteSectionId <> @NoteSectionId)
        THROW 50004, N'VALIDATION:A note keeps at least one tab', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT s.NoteSectionId, s.[NoteId], s.[Title], s.[SortOrder],
                (SELECT t.NoteTabId, t.[Title], t.[Content], t.[SortOrder] FROM app.NoteTab AS t
                 WHERE t.NoteSectionId = s.NoteSectionId AND t.IsDeleted = 0
                 ORDER BY t.[SortOrder] FOR JSON PATH) AS Pages
         FROM app.NoteSection AS s WHERE s.NoteSectionId = @NoteSectionId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.NoteSection SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE NoteSectionId = @NoteSectionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:NoteSection was modified by someone else', 1;

    UPDATE app.NoteTab SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE NoteSectionId = @NoteSectionId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.NoteSection', CAST(@NoteSectionId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
