-- usp_ChecklistItem_Delete — soft-delete a row with its values (ADR-0066).
-- Access: Manager + checklists:delete. A stale @RowVer answers 409. A to-do the row made stays.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistItem_Delete
    @ChecklistItemId INT,
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
         @MinLevel = N'Manager', @Permission = N'checklists:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    BEGIN TRAN;

    UPDATE app.ChecklistItem SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId)
    VALUES (@ActorUserId, N'Delete', N'app.ChecklistItem', CAST(@ChecklistItemId AS NVARCHAR(64)));

    COMMIT;
END;
GO
