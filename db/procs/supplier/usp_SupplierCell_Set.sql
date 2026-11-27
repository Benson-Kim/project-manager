-- usp_SupplierCell_Set — fill or empty one added-column cell of a supplier (ADR-0067). The
--   column's kind decides what @Value may be: a date 'YYYY-MM-DD'; text of at most 2,000
--   characters; an http(s) address of at most 2,048 characters with no spaces; a live choice's id.
--   NULL or blank empties the cell (an empty cell has no row).
-- Access: Manager + suppliers:update. The write takes the supplier's @RowVer and bumps it,
--   so a stale row answers 409. Answers with the supplier's new version and its added cells.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_SupplierCell_Set
    @SupplierId       INT,
    @SupplierColumnId INT,
    @Value               NVARCHAR(2100) = NULL,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.Supplier WHERE SupplierId = @SupplierId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Supplier not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'suppliers:update', @AllowProjectless = 0;

    DECLARE @Kind VARCHAR(20) = (
        SELECT Kind FROM app.SupplierColumn
        WHERE SupplierColumnId = @SupplierColumnId AND ProjectId = @ProjectId AND IsDeleted = 0);
    IF @Kind IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Supplier was modified by someone else', 1;

    SET @Value = NULLIF(TRIM(@Value), N'');
    DECLARE @OptionId INT;
    IF @Value IS NOT NULL
    BEGIN
        IF @Kind = 'text' AND LEN(@Value) > 2000
            THROW 50004, N'VALIDATION:A text cell has at most 2,000 characters', 1;
        IF @Kind = 'date' AND (@Value NOT LIKE N'[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'
                               OR TRY_CONVERT(DATE, @Value, 23) IS NULL)
            THROW 50004, N'VALIDATION:Enter a date as YYYY-MM-DD', 1;
        IF @Kind = 'document' AND (LEN(@Value) > 2048
                                   OR NOT (@Value LIKE N'http://_%' OR @Value LIKE N'https://_%')
                                   OR PATINDEX(N'%[ <>"' + NCHAR(9) + NCHAR(10) + NCHAR(13) + N']%', @Value) > 0)
            THROW 50004, N'VALIDATION:Enter a web address that starts with http:// or https://', 1;
        IF @Kind = 'choice'
        BEGIN
            SET @OptionId = (SELECT SupplierColumnOptionId FROM app.SupplierColumnOption
                             WHERE SupplierColumnOptionId = TRY_CAST(@Value AS INT)
                               AND SupplierColumnId = @SupplierColumnId AND IsDeleted = 0);
            IF @OptionId IS NULL
                THROW 50004, N'VALIDATION:Pick one of the column''s choices', 1;
        END;
    END;

    BEGIN TRAN;

    -- The column and its choice are checked again under the column lock that deleting the column,
    -- changing its kind or deleting a choice takes, so no value lands in a column or choice that is
    -- gone or now holds something else.
    DECLARE @LockedKind VARCHAR(20);
    SELECT @LockedKind = Kind FROM app.SupplierColumn WITH (UPDLOCK, HOLDLOCK)
    WHERE SupplierColumnId = @SupplierColumnId AND IsDeleted = 0;
    IF @LockedKind IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;
    IF @LockedKind <> @Kind
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;
    IF @OptionId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM app.SupplierColumnOption
        WHERE SupplierColumnOptionId = @OptionId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:Pick one of the column''s choices', 1;

    UPDATE app.Supplier SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE SupplierId = @SupplierId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Supplier was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TextValue AS [text], DateValue AS [date], LinkUrl AS link, OptionId AS optionId
         FROM app.SupplierCell
         WHERE SupplierId = @SupplierId AND SupplierColumnId = @SupplierColumnId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    IF @Value IS NULL
        DELETE FROM app.SupplierCell
        WHERE SupplierId = @SupplierId AND SupplierColumnId = @SupplierColumnId;
    ELSE
    BEGIN
        DECLARE @Text NVARCHAR(2000) = CASE WHEN @Kind = 'text' THEN @Value END,
                @Date DATE = CASE WHEN @Kind = 'date' THEN TRY_CONVERT(DATE, @Value, 23) END,
                @Link NVARCHAR(2048) = CASE WHEN @Kind = 'document' THEN @Value END;
        UPDATE app.SupplierCell WITH (UPDLOCK, HOLDLOCK) SET
            TextValue = @Text, DateValue = @Date, LinkUrl = @Link, OptionId = @OptionId,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE SupplierId = @SupplierId AND SupplierColumnId = @SupplierColumnId;
        IF @@ROWCOUNT = 0
            INSERT INTO app.SupplierCell
                (SupplierId, SupplierColumnId, ProjectId, TextValue, DateValue, LinkUrl, OptionId, UpdatedBy)
            VALUES (@SupplierId, @SupplierColumnId, @ProjectId, @Text, @Date, @Link, @OptionId, @ActorUserId);
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.SupplierCell',
            CAST(@SupplierId AS NVARCHAR(30)) + N':' + CAST(@SupplierColumnId AS NVARCHAR(30)),
            @Before,
            (SELECT @Value AS [value] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT SupplierId, CAST(RowVer AS BIGINT) AS RowVer,
           dbo.ufn_Supplier_CustomCells(SupplierId) AS CustomCellsJson
    FROM app.Supplier WHERE SupplierId = @SupplierId;
END;
GO
