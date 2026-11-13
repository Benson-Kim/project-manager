-- usp_RequirementColumnOption_Delete — take a choice off a choice list (ADR-0067). Refused while any
--   live requirement holds it, saying how many, so no value is ever left pointing at nothing; the
--   user picks another choice on those rows first. Soft, so the audit trail keeps its name.
-- Access: Manager + requirements:delete. A stale @RowVer answers 409.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementColumnOption_Delete
    @RequirementColumnOptionId INT,
    @RowVer                    BIGINT,
    @ActorUserId               INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @ColumnId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @ColumnId = RequirementColumnId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.RequirementColumnOption
    WHERE RequirementColumnOptionId = @RequirementColumnOptionId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Choice not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'requirements:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Someone else changed this choice', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = RequirementColumnId FROM app.RequirementColumn WITH (UPDLOCK, HOLDLOCK)
    WHERE RequirementColumnId = @ColumnId;

    DECLARE @InUse INT = (
        SELECT COUNT(*) FROM app.RequirementCell v WITH (HOLDLOCK)
        JOIN app.Requirement r ON r.RequirementId = v.RequirementId AND r.IsDeleted = 0
        WHERE v.OptionId = @RequirementColumnOptionId);
    IF @InUse > 0
    BEGIN
        DECLARE @Msg NVARCHAR(200) = CONCAT(N'VALIDATION:', @InUse,
            CASE WHEN @InUse = 1 THEN N' requirement holds' ELSE N' requirements hold' END,
            N' this choice. Pick another choice on them first');
        THROW 50004, @Msg, 1;
    END;

    UPDATE app.RequirementColumnOption
    SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE RequirementColumnOptionId = @RequirementColumnOptionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Someone else changed this choice', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId)
    VALUES (@ActorUserId, N'Delete', N'app.RequirementColumnOption', CAST(@RequirementColumnOptionId AS NVARCHAR(64)));

    COMMIT;
END;
GO
