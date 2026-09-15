-- usp_NoteTab_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.NoteTab (source: (new — titled tabs per checklist rows 17-20)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_Delete
    @NoteTabId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.NoteTab WHERE NoteTabId = @NoteTabId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:NoteTab not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:NoteTab was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT NoteTabId, [NoteId], [Title], [Content], [SortOrder]
         FROM app.NoteTab WHERE NoteTabId = @NoteTabId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.NoteTab SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE NoteTabId = @NoteTabId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.NoteTab', CAST(@NoteTabId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
