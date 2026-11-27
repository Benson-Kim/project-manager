-- usp_CrossLink_Delete — soft-deletes a 1-to-1 cross-link with RowVer concurrency (50002) and
-- in-transaction AuditLog.
-- Personal (ADR-0074): only the creator may delete, needing read access to each live end;
-- an end whose record or project is gone does not block the creator (orphan clean-up).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_CrossLink_Delete
    @CrossLinkId INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT, @CreatedBy INT,
            @EndAModule NVARCHAR(40), @EndAProjectId INT, @EndAEntityId INT, @EndASubEntityId INT, @EndAAnchorKey NVARCHAR(80),
            @EndBModule NVARCHAR(40), @EndBProjectId INT, @EndBEntityId INT, @EndBSubEntityId INT, @EndBAnchorKey NVARCHAR(80);
    SELECT @CurrentVer = CAST(RowVer AS BIGINT),
           @CreatedBy = CreatedBy,
           @EndAModule = EndAModule,
           @EndAProjectId = EndAProjectId,
           @EndAEntityId = EndAEntityId,
           @EndASubEntityId = EndASubEntityId,
           @EndAAnchorKey = EndAAnchorKey,
           @EndBModule = EndBModule,
           @EndBProjectId = EndBProjectId,
           @EndBEntityId = EndBEntityId,
           @EndBSubEntityId = EndBSubEntityId,
           @EndBAnchorKey = EndBAnchorKey
    FROM app.CrossLink WITH (UPDLOCK, HOLDLOCK)
    WHERE CrossLinkId = @CrossLinkId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Cross-link not found', 1;

    DECLARE @LiveProjectA INT, @LiveProjectB INT, @OrphanA BIT, @OrphanB BIT;

    EXEC dbo.usp_CrossLink_AssertAccess
         @ModuleKey = @EndAModule, @StoredProjectId = @EndAProjectId,
         @EntityId = @EndAEntityId, @SubEntityId = @EndASubEntityId, @AnchorKey = @EndAAnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Viewer', @Permission = N'cross-links:read',
         @CreatedBy = @CreatedBy, @AllowOrphan = 1,
         @LiveProjectId = @LiveProjectA OUTPUT, @IsOrphan = @OrphanA OUTPUT;

    EXEC dbo.usp_CrossLink_AssertAccess
         @ModuleKey = @EndBModule, @StoredProjectId = @EndBProjectId,
         @EntityId = @EndBEntityId, @SubEntityId = @EndBSubEntityId, @AnchorKey = @EndBAnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Viewer', @Permission = N'cross-links:read',
         @CreatedBy = @CreatedBy, @AllowOrphan = 1,
         @LiveProjectId = @LiveProjectB OUTPUT, @IsOrphan = @OrphanB OUTPUT;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Cross-link was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) = (
        SELECT CrossLinkId, EndAModule, EndAProjectId, EndAEntityId, EndBModule, EndBProjectId, EndBEntityId, LinkTitle, NoteText, Color
        FROM app.CrossLink WHERE CrossLinkId = @CrossLinkId
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
    );

    UPDATE app.CrossLink SET
        EndAProjectId = CASE WHEN @OrphanA = 1 THEN EndAProjectId ELSE @LiveProjectA END,
        EndBProjectId = CASE WHEN @OrphanB = 1 THEN EndBProjectId ELSE @LiveProjectB END,
        IsDeleted     = 1,
        DeletedAtUtc  = SYSUTCDATETIME(),
        DeletedBy     = @ActorUserId
    WHERE CrossLinkId = @CrossLinkId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Cross-link was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.CrossLink', CAST(@CrossLinkId AS NVARCHAR(64)), @Before);

    COMMIT;

    SELECT @CrossLinkId AS CrossLinkId;
END;
GO
