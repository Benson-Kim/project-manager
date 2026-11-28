-- usp_KeywordCell_Set — fill or empty one added-column cell of a keyword (ADR-0067). The
--   column's kind decides what @Value may be: a date 'YYYY-MM-DD'; text of at most 2,000
--   characters; an http(s) address of at most 2,048 characters with no spaces; a live choice's id.
--   NULL or blank empties the cell (an empty cell has no row).
-- Access: Manager + keywords:update. The write takes the keyword's @RowVer and bumps it,
--   so a stale row answers 409. Answers with the keyword's new version and its added cells.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeywordCell_Set
    @KeywordId       INT,
    @KeywordColumnId INT,
    @Value               NVARCHAR(2100) = NULL,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.Keyword WHERE KeywordId = @KeywordId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Keyword not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'keywords:update', @AllowProjectless = 0;

    DECLARE @Kind VARCHAR(20) = (
        SELECT Kind FROM app.KeywordColumn
        WHERE KeywordColumnId = @KeywordColumnId AND ProjectId = @ProjectId AND IsDeleted = 0);
    IF @Kind IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Keyword was modified by someone else', 1;

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
            SET @OptionId = (SELECT KeywordColumnOptionId FROM app.KeywordColumnOption
                             WHERE KeywordColumnOptionId = TRY_CAST(@Value AS INT)
                               AND KeywordColumnId = @KeywordColumnId AND IsDeleted = 0);
            IF @OptionId IS NULL
                THROW 50004, N'VALIDATION:Pick one of the column''s choices', 1;
        END;
    END;

    BEGIN TRAN;

    -- The column and its choice are checked again under the column lock that deleting the column,
    -- changing its kind or deleting a choice takes, so no value lands in a column or choice that is
    -- gone or now holds something else.
    DECLARE @LockedKind VARCHAR(20);
    SELECT @LockedKind = Kind FROM app.KeywordColumn WITH (UPDLOCK, HOLDLOCK)
    WHERE KeywordColumnId = @KeywordColumnId AND IsDeleted = 0;
    IF @LockedKind IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;
    IF @LockedKind <> @Kind
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;
    IF @OptionId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM app.KeywordColumnOption
        WHERE KeywordColumnOptionId = @OptionId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:Pick one of the column''s choices', 1;

    UPDATE app.Keyword SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE KeywordId = @KeywordId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Keyword was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TextValue AS [text], DateValue AS [date], LinkUrl AS link, OptionId AS optionId
         FROM app.KeywordCell
         WHERE KeywordId = @KeywordId AND KeywordColumnId = @KeywordColumnId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    IF @Value IS NULL
        DELETE FROM app.KeywordCell
        WHERE KeywordId = @KeywordId AND KeywordColumnId = @KeywordColumnId;
    ELSE
    BEGIN
        DECLARE @Text NVARCHAR(2000) = CASE WHEN @Kind = 'text' THEN @Value END,
                @Date DATE = CASE WHEN @Kind = 'date' THEN TRY_CONVERT(DATE, @Value, 23) END,
                @Link NVARCHAR(2048) = CASE WHEN @Kind = 'document' THEN @Value END;
        UPDATE app.KeywordCell WITH (UPDLOCK, HOLDLOCK) SET
            TextValue = @Text, DateValue = @Date, LinkUrl = @Link, OptionId = @OptionId,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE KeywordId = @KeywordId AND KeywordColumnId = @KeywordColumnId;
        IF @@ROWCOUNT = 0
            INSERT INTO app.KeywordCell
                (KeywordId, KeywordColumnId, ProjectId, TextValue, DateValue, LinkUrl, OptionId, UpdatedBy)
            VALUES (@KeywordId, @KeywordColumnId, @ProjectId, @Text, @Date, @Link, @OptionId, @ActorUserId);
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeywordCell',
            CAST(@KeywordId AS NVARCHAR(30)) + N':' + CAST(@KeywordColumnId AS NVARCHAR(30)),
            @Before,
            (SELECT @Value AS [value] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT KeywordId, CAST(RowVer AS BIGINT) AS RowVer,
           dbo.ufn_Keyword_CustomCells(KeywordId) AS CustomCellsJson
    FROM app.Keyword WHERE KeywordId = @KeywordId;
END;
GO
