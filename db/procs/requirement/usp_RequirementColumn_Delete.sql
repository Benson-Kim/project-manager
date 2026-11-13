-- usp_RequirementColumn_Delete — take an added column off the requirement register (ADR-0067).
--   Soft: the column, its options and its values stay in their tables under the column's id, so
--   restoring the column brings every value back; nothing reads them meanwhile.
-- Access: Manager + requirements:delete. A stale @RowVer answers 409. Audits how many values it hid.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementColumn_Delete
    @RequirementColumnId INT,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.RequirementColumn WHERE RequirementColumnId = @RequirementColumnId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'requirements:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;

    BEGIN TRAN;

    UPDATE app.RequirementColumn
    SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE RequirementColumnId = @RequirementColumnId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;

    DECLARE @Kept INT = (SELECT COUNT(*) FROM app.RequirementCell WHERE RequirementColumnId = @RequirementColumnId);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.RequirementColumn', CAST(@RequirementColumnId AS NVARCHAR(64)),
            (SELECT @Kept AS valuesHidden FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;
END;
GO
