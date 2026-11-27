-- usp_CrossLink_AssertAccess — resolves live endpoint access for one cross-link end via
-- dbo.ufn_CrossLink_ResolveEndpoint (ADR-0074).
-- Cross-links are personal: an existing link (@CreatedBy supplied) is visible to and managed by
-- its creator only, with no Admin or project-manager override. Anyone else gets 50001, the same
-- answer as a missing or unreadable target (ADR-0040 non-disclosure).
-- @AllowOrphan = 1 (delete only): the creator may pass an end whose record or project is gone.
-- An end that is still live but unreadable to the actor stays 50001.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_CrossLink_AssertAccess
    @ModuleKey       NVARCHAR(40),
    @StoredProjectId INT           = NULL,
    @EntityId        INT           = NULL,
    @SubEntityId     INT           = NULL,
    @AnchorKey       NVARCHAR(80)  = NULL,
    @ActorUserId     INT,
    @MinLevel        NVARCHAR(20),
    @Permission      NVARCHAR(64)  = NULL,
    @CreatedBy       INT           = NULL,
    @RequireMatch    BIT           = 0,
    @AllowOrphan     BIT           = 0,
    @LiveProjectId   INT           = NULL OUTPUT,
    @IsOrphan        BIT           = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @IsOrphan = 0;

    IF @CreatedBy IS NOT NULL AND @CreatedBy <> @ActorUserId
        THROW 50001, N'NOT_FOUND:Cross-link target not found', 1;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    DECLARE @Level NVARCHAR(20), @Found BIT = 0;
    SELECT @LiveProjectId = r.LiveProjectId,
           @Level = r.AccessLevel,
           @Found = 1
    FROM dbo.ufn_CrossLink_ResolveEndpoint(
        @ModuleKey, @StoredProjectId, @EntityId, @SubEntityId, @AnchorKey, @ActorRole, @ActorUserId
    ) AS r;

    IF @Found = 0 OR @Level IS NULL
    BEGIN
        IF @AllowOrphan = 1 AND @CreatedBy = @ActorUserId
           AND NOT EXISTS (
               SELECT 1
               FROM dbo.ufn_CrossLink_ResolveEndpoint(
                   @ModuleKey, @StoredProjectId, @EntityId, @SubEntityId, @AnchorKey, N'Admin', @ActorUserId
               ) AS live
               WHERE live.AccessLevel IS NOT NULL
           )
        BEGIN
            SELECT @LiveProjectId = NULL, @IsOrphan = 1;
            RETURN;
        END;
        THROW 50001, N'NOT_FOUND:Cross-link target not found', 1;
    END;

    IF @RequireMatch = 1
       AND @ModuleKey NOT IN (N'board', N'note', N'todo', N'daily-activity')
       AND ISNULL(@StoredProjectId, -1) <> ISNULL(@LiveProjectId, -1)
        THROW 50001, N'NOT_FOUND:Cross-link target not found', 1;

    DECLARE @EffectivePermission NVARCHAR(64) =
        CASE WHEN @MinLevel = N'Viewer' THEN NULL ELSE @Permission END;

    EXEC dbo.usp_Permission_Require
        @Level = @Level,
        @MinLevel = @MinLevel,
        @ProjectId = @LiveProjectId,
        @ActorUserId = @ActorUserId,
        @ActorRole = @ActorRole,
        @Permission = @EffectivePermission;
END;
GO
