-- usp_RequirementCell_Set — fill or empty one added-column cell of a requirement (ADR-0067). The
--   column's kind decides what @Value may be: a date 'YYYY-MM-DD'; text of at most 2,000
--   characters; an http(s) address of at most 2,048 characters with no spaces; a live choice's id.
--   NULL or blank empties the cell (an empty cell has no row).
-- Access: Contributor + requirements:update. The write takes the requirement's @RowVer and bumps it,
--   so a stale row answers 409. Answers with the requirement's new version and its added cells.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCell_Set
    @RequirementId       INT,
    @RequirementColumnId INT,
    @Value               NVARCHAR(2100) = NULL,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    DECLARE @Kind VARCHAR(20) = (
        SELECT Kind FROM app.RequirementColumn
        WHERE RequirementColumnId = @RequirementColumnId AND ProjectId = @ProjectId AND IsDeleted = 0);
    IF @Kind IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

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
            SET @OptionId = (SELECT RequirementColumnOptionId FROM app.RequirementColumnOption
                             WHERE RequirementColumnOptionId = TRY_CAST(@Value AS INT)
                               AND RequirementColumnId = @RequirementColumnId AND IsDeleted = 0);
            IF @OptionId IS NULL
                THROW 50004, N'VALIDATION:Pick one of the column''s choices', 1;
        END;
    END;

    BEGIN TRAN;

    -- A choice is checked again under the column lock that deleting a choice takes, so a choice
    -- deleted meanwhile is never stored.
    IF @OptionId IS NOT NULL
    BEGIN
        DECLARE @ColumnLock INT;
        SELECT @ColumnLock = RequirementColumnId FROM app.RequirementColumn WITH (UPDLOCK, HOLDLOCK)
        WHERE RequirementColumnId = @RequirementColumnId;
        IF NOT EXISTS (SELECT 1 FROM app.RequirementColumnOption
                       WHERE RequirementColumnOptionId = @OptionId AND IsDeleted = 0)
            THROW 50004, N'VALIDATION:Pick one of the column''s choices', 1;
    END;

    UPDATE app.Requirement SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE RequirementId = @RequirementId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TextValue AS [text], DateValue AS [date], LinkUrl AS link, OptionId AS optionId
         FROM app.RequirementCell
         WHERE RequirementId = @RequirementId AND RequirementColumnId = @RequirementColumnId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    IF @Value IS NULL
        DELETE FROM app.RequirementCell
        WHERE RequirementId = @RequirementId AND RequirementColumnId = @RequirementColumnId;
    ELSE
    BEGIN
        DECLARE @Text NVARCHAR(2000) = CASE WHEN @Kind = 'text' THEN @Value END,
                @Date DATE = CASE WHEN @Kind = 'date' THEN TRY_CONVERT(DATE, @Value, 23) END,
                @Link NVARCHAR(2048) = CASE WHEN @Kind = 'document' THEN @Value END;
        UPDATE app.RequirementCell WITH (UPDLOCK, HOLDLOCK) SET
            TextValue = @Text, DateValue = @Date, LinkUrl = @Link, OptionId = @OptionId,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE RequirementId = @RequirementId AND RequirementColumnId = @RequirementColumnId;
        IF @@ROWCOUNT = 0
            INSERT INTO app.RequirementCell
                (RequirementId, RequirementColumnId, ProjectId, TextValue, DateValue, LinkUrl, OptionId, UpdatedBy)
            VALUES (@RequirementId, @RequirementColumnId, @ProjectId, @Text, @Date, @Link, @OptionId, @ActorUserId);
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.RequirementCell',
            CAST(@RequirementId AS NVARCHAR(30)) + N':' + CAST(@RequirementColumnId AS NVARCHAR(30)),
            @Before,
            (SELECT @Value AS [value] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT RequirementId, CAST(RowVer AS BIGINT) AS RowVer,
           dbo.ufn_Requirement_CustomCells(RequirementId) AS CustomCellsJson
    FROM app.Requirement WHERE RequirementId = @RequirementId;
END;
GO
