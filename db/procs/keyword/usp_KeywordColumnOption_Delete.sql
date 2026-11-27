-- usp_KeywordColumnOption_Delete — take a choice off a choice list (ADR-0067). Refused while any
--   live keyword holds it, saying how many, so no value is ever left pointing at nothing; the
--   user picks another choice on those rows first. Soft, so the audit trail keeps its name.
-- Access: Manager + keywords:delete. A stale @RowVer answers 409.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeywordColumnOption_Delete
    @KeywordColumnOptionId INT,
    @RowVer                    BIGINT,
    @ActorUserId               INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @ColumnId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @ColumnId = KeywordColumnId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.KeywordColumnOption
    WHERE KeywordColumnOptionId = @KeywordColumnOptionId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Choice not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'keywords:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Someone else changed this choice', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = KeywordColumnId FROM app.KeywordColumn WITH (UPDLOCK, HOLDLOCK)
    WHERE KeywordColumnId = @ColumnId;

    DECLARE @InUse INT = (
        SELECT COUNT(*) FROM app.KeywordCell v WITH (HOLDLOCK)
        JOIN app.Keyword r ON r.KeywordId = v.KeywordId AND r.IsDeleted = 0
        WHERE v.OptionId = @KeywordColumnOptionId);
    IF @InUse > 0
    BEGIN
        DECLARE @Msg NVARCHAR(200) = CONCAT(N'VALIDATION:', @InUse,
            CASE WHEN @InUse = 1 THEN N' keyword holds' ELSE N' keywords hold' END,
            N' this choice. Pick another choice on them first');
        THROW 50004, @Msg, 1;
    END;

    UPDATE app.KeywordColumnOption
    SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    WHERE KeywordColumnOptionId = @KeywordColumnOptionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Someone else changed this choice', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId)
    VALUES (@ActorUserId, N'Delete', N'app.KeywordColumnOption', CAST(@KeywordColumnOptionId AS NVARCHAR(64)));

    COMMIT;
END;
GO
