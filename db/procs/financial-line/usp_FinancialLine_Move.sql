-- usp_FinancialLine_Move - move a budget line one place up or down within its section
-- (ADR-0029). The section is renumbered 1..n first, then the line swaps places with its
-- neighbour; at either end nothing moves. RowVer of the moved line (CONFLICT 50002,
-- NOT_FOUND 50001). Access: Manager with 'financials:update'. Audited; returns the line.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialLine_Move
    @FinancialLineId INT,
    @Direction       VARCHAR(10),
    @RowVer          BIGINT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT, @Section VARCHAR(10);
    SELECT @FinancialId = FinancialId, @Section = [Section] FROM app.FinancialLine
    WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0;
    IF @FinancialId IS NULL
        THROW 50001, N'NOT_FOUND:Budget line not found', 1;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update';

    IF ISNULL(@Direction, '') NOT IN ('up', 'down')
        THROW 50004, N'VALIDATION:Direction must be up or down', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = FinancialId FROM app.Financial WITH (UPDLOCK, HOLDLOCK) WHERE FinancialId = @FinancialId;

    IF NOT EXISTS (SELECT 1 FROM app.FinancialLine
                   WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.FinancialLine WHERE FinancialLineId = @FinancialLineId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Budget line not found', 1;
        THROW 50002, N'CONFLICT:The budget line was changed by someone else', 1;
    END;

    WITH ordered AS (
        SELECT SortOrder, ROW_NUMBER() OVER (ORDER BY SortOrder, FinancialLineId) AS Position
        FROM app.FinancialLine
        WHERE FinancialId = @FinancialId AND [Section] = @Section AND IsDeleted = 0
    )
    UPDATE ordered SET SortOrder = Position WHERE SortOrder <> Position;

    DECLARE @Position INT = (SELECT SortOrder FROM app.FinancialLine WHERE FinancialLineId = @FinancialLineId);
    DECLARE @Target INT = @Position + CASE WHEN @Direction = 'up' THEN -1 ELSE 1 END;
    DECLARE @NeighbourId INT =
        (SELECT FinancialLineId FROM app.FinancialLine
         WHERE FinancialId = @FinancialId AND [Section] = @Section AND IsDeleted = 0 AND SortOrder = @Target);

    IF @NeighbourId IS NOT NULL
    BEGIN
        UPDATE app.FinancialLine SET
            SortOrder = CASE WHEN FinancialLineId = @FinancialLineId THEN @Target ELSE @Position END,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE FinancialLineId IN (@FinancialLineId, @NeighbourId);

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'Move', N'app.FinancialLine', CAST(@FinancialLineId AS NVARCHAR(64)),
                (SELECT @Position AS SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                (SELECT @Target AS SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT * FROM dbo.ufn_FinancialLine_Row(@FinancialLineId);
END;
GO
