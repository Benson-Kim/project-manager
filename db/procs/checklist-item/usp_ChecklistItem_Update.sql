-- usp_ChecklistItem_Update — change a row's title (ADR-0066).
-- Access: Contributor + checklists:update. A stale @RowVer answers 409.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistItem_Update
    @ChecklistItemId INT,
    @Title           NVARCHAR(500),
    @RowVer          BIGINT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT, @OldTitle NVARCHAR(400);
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @OldTitle = Title
    FROM app.ChecklistItem WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Row not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    SET @Title = TRIM(@Title);
    IF @Title IS NULL OR LEN(@Title) = 0 OR LEN(@Title) > 400
        THROW 50004, N'VALIDATION:A row title has 1 to 400 characters', 1;

    BEGIN TRAN;

    UPDATE app.ChecklistItem SET Title = @Title, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ChecklistItem', CAST(@ChecklistItemId AS NVARCHAR(64)),
            (SELECT @OldTitle AS title FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Title AS title FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT * FROM dbo.ufn_ChecklistItem_Row(@ActorRole, @ActorUserId, @ChecklistItemId);
END;
GO
