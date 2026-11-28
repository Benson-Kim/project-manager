-- usp_KeywordColumn_SetKind — change what an added register column holds (ADR-0067), only while
--   it holds no value, so no value is ever reinterpreted or lost. A choice list given this way
--   starts with @OptionsJson; leaving the choice kind retires its options.
-- Access: Manager + keywords:update. A stale @RowVer answers 409.
-- THROW 50004 VALIDATION : the column holds values, or the kind or choices are wrong.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeywordColumn_SetKind
    @KeywordColumnId INT,
    @Kind                VARCHAR(20),
    @OptionsJson         NVARCHAR(MAX) = NULL,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT, @OldKind VARCHAR(20);
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @OldKind = Kind
    FROM app.KeywordColumn WHERE KeywordColumnId = @KeywordColumnId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'keywords:update', @AllowProjectless = 0;

    IF @Kind IS NULL OR @Kind NOT IN ('date', 'text', 'document', 'choice')
        THROW 50004, N'VALIDATION:Pick what the column holds', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;

    DECLARE @Options TABLE (Label NVARCHAR(200) NOT NULL, Place INT NOT NULL);
    IF @Kind = 'choice' AND @OldKind <> 'choice'
    BEGIN
        IF @OptionsJson IS NULL OR ISJSON(@OptionsJson) = 0
            THROW 50004, N'VALIDATION:A choice list needs at least one choice', 1;
        INSERT INTO @Options (Label, Place)
        SELECT TRIM([value]), CAST([key] AS INT) FROM OPENJSON(@OptionsJson) WHERE [type] = 1;
        DELETE FROM @Options WHERE Label = N'';
        IF NOT EXISTS (SELECT 1 FROM @Options) OR (SELECT COUNT(*) FROM @Options) > 50
            THROW 50004, N'VALIDATION:A choice list has 1 to 50 choices', 1;
        IF EXISTS (SELECT 1 FROM @Options WHERE LEN(Label) > 80)
            THROW 50004, N'VALIDATION:A choice has at most 80 characters', 1;
        IF (SELECT COUNT(DISTINCT UPPER(Label)) FROM @Options) <> (SELECT COUNT(*) FROM @Options)
            THROW 50005, N'DUPLICATE:Each choice appears once', 1;
    END;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = KeywordColumnId FROM app.KeywordColumn WITH (UPDLOCK, HOLDLOCK)
    WHERE KeywordColumnId = @KeywordColumnId;

    IF EXISTS (SELECT 1 FROM app.KeywordCell WITH (HOLDLOCK)
               WHERE KeywordColumnId = @KeywordColumnId)
        THROW 50004, N'VALIDATION:This column holds values, so what it holds cannot change. Add a new column instead', 1;

    UPDATE app.KeywordColumn SET Kind = @Kind, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE KeywordColumnId = @KeywordColumnId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;

    IF @Kind <> 'choice'
        UPDATE app.KeywordColumnOption
        SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
        WHERE KeywordColumnId = @KeywordColumnId AND IsDeleted = 0;
    INSERT INTO app.KeywordColumnOption (KeywordColumnId, ProjectId, Label, SortOrder, CreatedBy)
    SELECT @KeywordColumnId, @ProjectId, Label, Place + 1, @ActorUserId FROM @Options;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'SetKind', N'app.KeywordColumn', CAST(@KeywordColumnId AS NVARCHAR(64)),
            (SELECT @OldKind AS kind FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Kind AS kind FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT KeywordColumnId, Name, Kind, SortOrder, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.KeywordColumn WHERE KeywordColumnId = @KeywordColumnId;
END;
GO
