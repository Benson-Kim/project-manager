-- usp_ChecklistColumn_Delete — soft-delete a column; its values leave the checklist with it (ADR-0066).
-- Access: Manager + checklists:delete. A stale @RowVer answers 409. The cells stay in the table under
--   the deleted column's id, so restoring the column brings its values back; nothing reads them
--   meanwhile (ufn_ChecklistItem_Row skips deleted columns). A to-do a cell made stays a to-do.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistColumn_Delete
    @ChecklistColumnId INT,
    @RowVer            BIGINT,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.ChecklistColumn WHERE ChecklistColumnId = @ChecklistColumnId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'checklists:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Column was modified by someone else', 1;

    BEGIN TRAN;

    UPDATE app.ChecklistColumn
    SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE ChecklistColumnId = @ChecklistColumnId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Column was modified by someone else', 1;

    DECLARE @Kept INT = (SELECT COUNT(*) FROM app.ChecklistCell WHERE ChecklistColumnId = @ChecklistColumnId);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.ChecklistColumn', CAST(@ChecklistColumnId AS NVARCHAR(64)),
            (SELECT @Kept AS valuesHidden FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;
END;
GO
