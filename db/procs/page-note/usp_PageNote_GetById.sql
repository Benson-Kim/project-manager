-- usp_PageNote_GetById — fetches one active small page note with live ProjectId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_PageNote_GetById
    @PageNoteId  INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ModuleKey NVARCHAR(40), @StoredProjectId INT, @EntityId INT, @SubEntityId INT,
            @AnchorKey NVARCHAR(80), @CreatedBy INT;
    SELECT @ModuleKey = ModuleKey,
           @StoredProjectId = ProjectId,
           @EntityId = EntityId,
           @SubEntityId = SubEntityId,
           @AnchorKey = AnchorKey,
           @CreatedBy = CreatedBy
    FROM app.PageNote
    WHERE PageNoteId = @PageNoteId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Page note not found', 1;

    DECLARE @LiveProjectId INT;
    EXEC dbo.usp_PageNote_AssertAccess
         @ModuleKey = @ModuleKey, @StoredProjectId = @StoredProjectId,
         @EntityId = @EntityId, @SubEntityId = @SubEntityId, @AnchorKey = @AnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Viewer', @CreatedBy = @CreatedBy,
         @LiveProjectId = @LiveProjectId OUTPUT;

    SELECT PageNoteId,
           ModuleKey,
           @LiveProjectId AS ProjectId,
           EntityId,
           SubEntityId,
           AnchorKind,
           AnchorKey,
           AnchorLabel,
           Body,
           Color,
           CreatedBy,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.PageNote
    WHERE PageNoteId = @PageNoteId AND IsDeleted = 0;
END;
GO
