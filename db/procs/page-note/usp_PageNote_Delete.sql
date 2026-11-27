-- usp_PageNote_Delete — soft-deletes a small page note with RowVer concurrency (50002) and
-- in-transaction AuditLog. Personal (ADR-0074): only the creator may delete, needing read access
-- to the live location; a location whose record or project is gone does not block the creator.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_PageNote_Delete
    @PageNoteId  INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT, @ModuleKey NVARCHAR(40), @StoredProjectId INT,
            @EntityId INT, @SubEntityId INT, @AnchorKey NVARCHAR(80), @CreatedBy INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT),
           @ModuleKey = ModuleKey,
           @StoredProjectId = ProjectId,
           @EntityId = EntityId,
           @SubEntityId = SubEntityId,
           @AnchorKey = AnchorKey,
           @CreatedBy = CreatedBy
    FROM app.PageNote WITH (UPDLOCK, HOLDLOCK)
    WHERE PageNoteId = @PageNoteId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Page note not found', 1;

    DECLARE @LiveProjectId INT, @IsOrphan BIT;
    EXEC dbo.usp_PageNote_AssertAccess
         @ModuleKey = @ModuleKey, @StoredProjectId = @StoredProjectId,
         @EntityId = @EntityId, @SubEntityId = @SubEntityId, @AnchorKey = @AnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Viewer',
         @CreatedBy = @CreatedBy, @AllowOrphan = 1,
         @LiveProjectId = @LiveProjectId OUTPUT, @IsOrphan = @IsOrphan OUTPUT;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Page note was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) = (
        SELECT PageNoteId, ModuleKey, ProjectId, EntityId, AnchorKind, AnchorKey, Body, Color
        FROM app.PageNote WHERE PageNoteId = @PageNoteId
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    );

    UPDATE app.PageNote SET
        ProjectId    = CASE WHEN @IsOrphan = 1 THEN ProjectId ELSE @LiveProjectId END,
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE PageNoteId = @PageNoteId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Page note was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.PageNote', CAST(@PageNoteId AS NVARCHAR(64)), @Before);

    COMMIT;

    SELECT @PageNoteId AS PageNoteId;
END;
GO
