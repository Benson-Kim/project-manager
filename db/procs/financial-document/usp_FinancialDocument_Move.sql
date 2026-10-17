-- usp_FinancialDocument_Move - move a document one place up or down in its financial's checklist
-- (ADR-0030). The list is renumbered 1..n first, then the document swaps places with its
-- neighbour; at either end nothing moves. RowVer of the moved document (CONFLICT 50002,
-- NOT_FOUND 50001). Access: Manager with 'financials:update'. Audited; returns the document.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_Move
    @FinancialDocumentId INT,
    @Direction           VARCHAR(10),
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @FinancialId INT;
    EXEC dbo.usp_FinancialDocument_AssertAccess
         @FinancialDocumentId = @FinancialDocumentId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update', @FinancialId = @FinancialId OUTPUT;

    IF ISNULL(@Direction, '') NOT IN ('up', 'down')
        THROW 50004, N'VALIDATION:Direction must be up or down', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = FinancialId FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    IF NOT EXISTS (SELECT 1 FROM app.FinancialDocument
                   WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.FinancialDocument WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Document not found', 1;
        THROW 50002, N'CONFLICT:The document was changed by someone else', 1;
    END;

    WITH ordered AS (
        SELECT SortOrder, ROW_NUMBER() OVER (ORDER BY SortOrder, FinancialDocumentId) AS Position
        FROM app.FinancialDocument
        WHERE FinancialId = @FinancialId AND IsDeleted = 0
    )
    UPDATE ordered SET SortOrder = Position WHERE SortOrder <> Position;

    DECLARE @Position INT = (SELECT SortOrder FROM app.FinancialDocument WHERE FinancialDocumentId = @FinancialDocumentId);
    DECLARE @Target INT = @Position + CASE WHEN @Direction = 'up' THEN -1 ELSE 1 END;
    DECLARE @NeighbourId INT =
        (SELECT FinancialDocumentId FROM app.FinancialDocument
         WHERE FinancialId = @FinancialId AND IsDeleted = 0 AND SortOrder = @Target);

    IF @NeighbourId IS NOT NULL
    BEGIN
        UPDATE app.FinancialDocument SET
            SortOrder = CASE WHEN FinancialDocumentId = @FinancialDocumentId THEN @Target ELSE @Position END,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE FinancialDocumentId IN (@FinancialDocumentId, @NeighbourId);

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'Move', N'app.FinancialDocument', CAST(@FinancialDocumentId AS NVARCHAR(64)),
                (SELECT @Position AS SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                (SELECT @Target AS SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT * FROM dbo.ufn_FinancialDocument_Row(@FinancialDocumentId);
END;
GO
