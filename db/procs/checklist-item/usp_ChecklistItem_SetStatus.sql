-- usp_ChecklistItem_SetStatus — tick a row done (who and when are kept) or untick it (ADR-0066).
-- Access: Contributor + checklists:update. A stale @RowVer answers 409.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistItem_SetStatus
    @ChecklistItemId INT,
    @IsDone          BIT,
    @RowVer          BIGINT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.ChecklistItem WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Row not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;
    IF @IsDone IS NULL
        THROW 50004, N'VALIDATION:Say whether the row is done', 1;

    BEGIN TRAN;

    UPDATE app.ChecklistItem SET
        IsDone       = @IsDone,
        DoneAtUtc    = CASE WHEN @IsDone = 1 THEN SYSUTCDATETIME() END,
        DoneBy       = CASE WHEN @IsDone = 1 THEN @ActorUserId END,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'SetStatus', N'app.ChecklistItem', CAST(@ChecklistItemId AS NVARCHAR(64)),
            (SELECT @IsDone AS isDone FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT * FROM dbo.ufn_ChecklistItem_Row(@ActorRole, @ActorUserId, @ChecklistItemId);
END;
GO
