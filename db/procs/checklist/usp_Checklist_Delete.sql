-- usp_Checklist_Delete — soft-delete a checklist with its columns and rows (ADR-0066).
-- Access: Manager + checklists:delete. The project comes from the row. A stale @RowVer answers 409.
--   Cells stay with their rows; nothing reads a deleted checklist's cells.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Checklist_Delete
    @ChecklistId INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.Checklist WHERE ChecklistId = @ChecklistId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Checklist not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'checklists:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Checklist was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();
    UPDATE app.Checklist SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Checklist was modified by someone else', 1;

    UPDATE app.ChecklistColumn SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0;
    UPDATE app.ChecklistItem SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId)
    VALUES (@ActorUserId, N'Delete', N'app.Checklist', CAST(@ChecklistId AS NVARCHAR(64)));

    COMMIT;
END;
GO
