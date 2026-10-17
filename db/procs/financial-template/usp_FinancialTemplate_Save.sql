-- usp_FinancialTemplate_Save - create (@FinancialTemplateId NULL) or replace a master template
-- (ADR-0029). Admin only (FORBIDDEN_ROW 50003; the role is read from auth.User): templates are
-- shared by every project. The document is checked by usp_FinancialTemplate_AssertDefinition.
-- Name 1-100 characters, unique among live templates (DUPLICATE 50005). @IsDefault = 1 makes this
-- the one default and clears the flag elsewhere in the same transaction. Updates need the
-- RowVer read (CONFLICT 50002; NOT_FOUND 50001 when gone). Audited in-transaction.
-- Financials already created from the template are snapshots and never change.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialTemplate_Save
    @FinancialTemplateId INT           = NULL,
    @Name                NVARCHAR(200),
    @Definition          NVARCHAR(MAX),
    @IsDefault           BIT           = 0,
    @RowVer              BIGINT        = NULL,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole <> N'Admin'
        THROW 50003, N'FORBIDDEN_ROW:Only administrators can edit financial templates', 1;

    SET @Name = LTRIM(RTRIM(@Name));
    IF @Name IS NULL OR LEN(@Name) NOT BETWEEN 1 AND 100
        THROW 50004, N'VALIDATION:A template needs a name of 1 to 100 characters', 1;
    IF @FinancialTemplateId IS NOT NULL AND @RowVer IS NULL
        THROW 50004, N'VALIDATION:RowVer is required', 1;
    SET @IsDefault = ISNULL(@IsDefault, 0);

    EXEC dbo.usp_FinancialTemplate_AssertDefinition @Definition = @Definition;

    BEGIN TRAN;

    IF EXISTS (SELECT 1 FROM app.FinancialTemplate WITH (UPDLOCK, HOLDLOCK)
               WHERE [Name] = @Name AND IsDeleted = 0
                 AND (@FinancialTemplateId IS NULL OR FinancialTemplateId <> @FinancialTemplateId))
        THROW 50005, N'DUPLICATE:Another template already has this name', 1;

    DECLARE @Before NVARCHAR(MAX);

    IF @FinancialTemplateId IS NULL
    BEGIN
        IF @IsDefault = 1
            UPDATE app.FinancialTemplate SET IsDefault = 0, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
            WHERE IsDefault = 1 AND IsDeleted = 0;

        INSERT INTO app.FinancialTemplate ([Name], [Definition], IsDefault, CreatedBy)
        VALUES (@Name, @Definition, @IsDefault, @ActorUserId);
        SET @FinancialTemplateId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        SET @Before = (SELECT FinancialTemplateId, [Name], [Definition], IsDefault
                       FROM app.FinancialTemplate WITH (UPDLOCK, HOLDLOCK)
                       WHERE FinancialTemplateId = @FinancialTemplateId AND IsDeleted = 0
                       FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        IF @Before IS NULL
            THROW 50001, N'NOT_FOUND:Template not found', 1;

        IF @IsDefault = 1
            UPDATE app.FinancialTemplate SET IsDefault = 0, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
            WHERE IsDefault = 1 AND IsDeleted = 0 AND FinancialTemplateId <> @FinancialTemplateId;

        UPDATE app.FinancialTemplate SET
            [Name]       = @Name,
            [Definition] = @Definition,
            IsDefault    = @IsDefault,
            UpdatedAtUtc = SYSUTCDATETIME(),
            UpdatedBy    = @ActorUserId
        WHERE FinancialTemplateId = @FinancialTemplateId AND IsDeleted = 0
          AND CAST(RowVer AS BIGINT) = @RowVer;
        IF @@ROWCOUNT = 0
            THROW 50002, N'CONFLICT:The template was changed by someone else', 1;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, CASE WHEN @Before IS NULL THEN N'Create' ELSE N'Update' END,
            N'app.FinancialTemplate', CAST(@FinancialTemplateId AS NVARCHAR(64)), @Before,
            (SELECT FinancialTemplateId, [Name], [Definition], IsDefault
             FROM app.FinancialTemplate WHERE FinancialTemplateId = @FinancialTemplateId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT FinancialTemplateId, [Name], [Definition], IsDefault, CreatedAtUtc, UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.FinancialTemplate
    WHERE FinancialTemplateId = @FinancialTemplateId;
END;
GO
