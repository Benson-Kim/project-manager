-- usp_NoteTab_Delete — soft-delete one page, with rowversion concurrency + in-transaction audit.
-- Access: Manager on the notebook's project, or a per-person grant (notes:delete, ADR-0024).
-- Entity app.NoteTab (titled pages per checklist rows 17-20). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_Delete
    @NoteTabId   INT,
    @RowVer      BIGINT,
    @ActorUserId INT
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
         @MinLevel = N'Manager', @Permission = N'notes:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = NoteId FROM app.Note WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT NoteTabId, [NoteId], [Title], [Content], [SortOrder]
         FROM app.NoteTab WHERE NoteTabId = @NoteTabId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.NoteTab SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE NoteTabId = @NoteTabId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.NoteTab WHERE NoteTabId = @NoteTabId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:NoteTab not found', 1;
        THROW 50002, N'CONFLICT:NoteTab was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.NoteTab', CAST(@NoteTabId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
