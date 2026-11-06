-- usp_RequirementCanvas_Delete — soft-delete one canvas (ADR-0061). It is a view, so every
--   requirement, WBS item and link stays. Its node rows stay with it, out of every read.
-- Access: Manager + requirements:delete, the same rule as any delete in the module. The project
--   comes from the row. A stale @RowVer answers 409.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvas_Delete
    @RequirementCanvasId INT,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentVer BIGINT, @OldName NVARCHAR(120);
    SELECT @RowProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @OldName = Name
    FROM app.RequirementCanvas
    WHERE RequirementCanvasId = @RequirementCanvasId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Canvas not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'requirements:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Canvas was modified by someone else', 1;

    BEGIN TRAN;

    UPDATE app.RequirementCanvas SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE RequirementCanvasId = @RequirementCanvasId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Canvas was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.RequirementCanvas',
            CAST(@RequirementCanvasId AS NVARCHAR(64)),
            (SELECT @OldName AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
