-- usp_ChecklistCell_Set — fill or empty one cell of a checklist row (ADR-0066). One proc for every
--   kind; the column's kind decides what @Value may be and which slot it lands in:
--   date     'YYYY-MM-DD'
--   text     at most 2,000 characters
--   document an http:// or https:// address of at most 2,048 characters, with no spaces
--   action   sign off only: '1' signs (who and when are kept), NULL clears; a to-do button is
--            pressed through usp_Todo_BuildFromChecklist instead.
--   NULL or blank empties the cell (an empty cell has no row).
-- Access: Contributor + checklists:update. The write takes the row's @RowVer and bumps it, so a
--   stale row answers 409 and two people never overwrite each other's cells.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistCell_Set
    @ChecklistItemId   INT,
    @ChecklistColumnId INT,
    @Value             NVARCHAR(2100) = NULL,
    @RowVer            BIGINT,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @ChecklistId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @ChecklistId = ChecklistId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.ChecklistItem WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Row not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:update', @AllowProjectless = 0;

    DECLARE @Kind VARCHAR(20), @ActionKind VARCHAR(20);
    SELECT @Kind = Kind, @ActionKind = ActionKind
    FROM app.ChecklistColumn
    WHERE ChecklistColumnId = @ChecklistColumnId AND ChecklistId = @ChecklistId AND IsDeleted = 0;
    IF @Kind IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    SET @Value = NULLIF(TRIM(@Value), N'');

    IF @Kind = 'action' AND @ActionKind = 'todo'
        THROW 50004, N'VALIDATION:Use the button to make a to-do', 1;
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
        IF @Kind = 'action' AND @Value <> N'1'
            THROW 50004, N'VALIDATION:A sign-off is on or off', 1;
    END;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT TextValue AS [text], DateValue AS [date], LinkUrl AS link, SignedAtUtc AS signedAt, SignedBy AS signedBy
         FROM app.ChecklistCell
         WHERE ChecklistItemId = @ChecklistItemId AND ChecklistColumnId = @ChecklistColumnId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    BEGIN TRAN;

    UPDATE app.ChecklistItem SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    IF @Value IS NULL
        DELETE FROM app.ChecklistCell
        WHERE ChecklistItemId = @ChecklistItemId AND ChecklistColumnId = @ChecklistColumnId;
    ELSE
    BEGIN
        DECLARE @Text NVARCHAR(2000) = CASE WHEN @Kind = 'text' THEN @Value END,
                @Date DATE = CASE WHEN @Kind = 'date' THEN TRY_CONVERT(DATE, @Value, 23) END,
                @Link NVARCHAR(2048) = CASE WHEN @Kind = 'document' THEN @Value END,
                @SignedAt DATETIME2 = CASE WHEN @Kind = 'action' THEN SYSUTCDATETIME() END,
                @SignedBy INT = CASE WHEN @Kind = 'action' THEN @ActorUserId END;

        UPDATE app.ChecklistCell WITH (UPDLOCK, HOLDLOCK) SET
            TextValue = @Text, DateValue = @Date, LinkUrl = @Link,
            SignedAtUtc = @SignedAt, SignedBy = @SignedBy, TodoItemId = NULL,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE ChecklistItemId = @ChecklistItemId AND ChecklistColumnId = @ChecklistColumnId;
        IF @@ROWCOUNT = 0
            INSERT INTO app.ChecklistCell
                (ChecklistItemId, ChecklistColumnId, ChecklistId, TextValue, DateValue, LinkUrl,
                 SignedAtUtc, SignedBy, UpdatedBy)
            VALUES (@ChecklistItemId, @ChecklistColumnId, @ChecklistId, @Text, @Date, @Link,
                    @SignedAt, @SignedBy, @ActorUserId);
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ChecklistCell',
            CAST(@ChecklistItemId AS NVARCHAR(30)) + N':' + CAST(@ChecklistColumnId AS NVARCHAR(30)),
            @Before,
            (SELECT @Value AS [value] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT * FROM dbo.ufn_ChecklistItem_Row(@ActorRole, @ActorUserId, @ChecklistItemId);
END;
GO
