-- usp_CrossLink_GetById — fetches one active 1-to-1 cross-link with live ProjectIds.
-- CROSS_SCOPE (ADR-0074): asserts Viewer+ on BOTH live ends; collapses missing/deleted/no-access
-- identically to THROW 50001 NOT_FOUND (ADR-0040).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_CrossLink_GetById
    @CrossLinkId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @EndAModule NVARCHAR(40), @EndAProjectId INT, @EndAEntityId INT, @EndASubEntityId INT, @EndAAnchorKey NVARCHAR(80),
            @EndBModule NVARCHAR(40), @EndBProjectId INT, @EndBEntityId INT, @EndBSubEntityId INT, @EndBAnchorKey NVARCHAR(80),
            @CreatedBy INT;
    SELECT @EndAModule = EndAModule,
           @EndAProjectId = EndAProjectId,
           @EndAEntityId = EndAEntityId,
           @EndASubEntityId = EndASubEntityId,
           @EndAAnchorKey = EndAAnchorKey,
           @EndBModule = EndBModule,
           @EndBProjectId = EndBProjectId,
           @EndBEntityId = EndBEntityId,
           @EndBSubEntityId = EndBSubEntityId,
           @EndBAnchorKey = EndBAnchorKey,
           @CreatedBy = CreatedBy
    FROM app.CrossLink
    WHERE CrossLinkId = @CrossLinkId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Cross-link not found', 1;

    DECLARE @LiveProjectA INT, @LiveProjectB INT;
    EXEC dbo.usp_CrossLink_AssertAccess
         @ModuleKey = @EndAModule, @StoredProjectId = @EndAProjectId,
         @EntityId = @EndAEntityId, @SubEntityId = @EndASubEntityId, @AnchorKey = @EndAAnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Viewer', @Permission = N'cross-links:read',
         @CreatedBy = @CreatedBy, @LiveProjectId = @LiveProjectA OUTPUT;

    EXEC dbo.usp_CrossLink_AssertAccess
         @ModuleKey = @EndBModule, @StoredProjectId = @EndBProjectId,
         @EntityId = @EndBEntityId, @SubEntityId = @EndBSubEntityId, @AnchorKey = @EndBAnchorKey,
         @ActorUserId = @ActorUserId, @MinLevel = N'Viewer', @Permission = N'cross-links:read',
         @CreatedBy = @CreatedBy, @LiveProjectId = @LiveProjectB OUTPUT;

    SELECT CrossLinkId,
           EndAModule,
           @LiveProjectA AS EndAProjectId,
           EndAEntityId,
           EndASubEntityId,
           EndAAnchorKind,
           EndAAnchorKey,
           EndALabel,
           EndBModule,
           @LiveProjectB AS EndBProjectId,
           EndBEntityId,
           EndBSubEntityId,
           EndBAnchorKind,
           EndBAnchorKey,
           EndBLabel,
           LinkTitle,
           NoteText,
           Color,
           CreatedBy,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.CrossLink
    WHERE CrossLinkId = @CrossLinkId AND IsDeleted = 0;
END;
GO
