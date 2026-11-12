-- usp_RequirementColumn_Create — add a column at the end of the project's requirement register
--   (ADR-0067): a date, text, a web link, or a choice list with its first options.
-- @OptionsJson: for a choice column, ["Open","Closed"] (1 to 50 distinct labels of 1 to 80
--   characters); NULL for any other kind. @BuiltInJson as usp_RequirementColumn_AssertName.
-- Access: Contributor + requirements:create. At most 5 live added columns per project.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementColumn_Create
    @ProjectId   INT,
    @Name        NVARCHAR(200),
    @Kind        VARCHAR(20),
    @OptionsJson NVARCHAR(MAX) = NULL,
    @BuiltInJson NVARCHAR(MAX),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:create', @AllowProjectless = 0;

    SET @Name = TRIM(@Name);
    IF @Kind IS NULL OR @Kind NOT IN ('date', 'text', 'document', 'choice')
        THROW 50004, N'VALIDATION:Pick what the column holds', 1;

    DECLARE @Options TABLE (Label NVARCHAR(200) NOT NULL, Place INT NOT NULL);
    IF @Kind = 'choice'
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
    END
    ELSE IF @OptionsJson IS NOT NULL
        THROW 50004, N'VALIDATION:Only a choice list has choices', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    IF (SELECT COUNT(*) FROM app.RequirementColumn WHERE ProjectId = @ProjectId AND IsDeleted = 0) >= 5
        THROW 50004, N'VALIDATION:The register has at most 5 added columns', 1;
    EXEC dbo.usp_RequirementColumn_AssertName
         @ProjectId = @ProjectId, @Name = @Name, @BuiltInJson = @BuiltInJson;

    DECLARE @Sort INT = 1 + ISNULL((SELECT MAX(SortOrder) FROM app.RequirementColumn
                                    WHERE ProjectId = @ProjectId AND IsDeleted = 0), 0);
    INSERT INTO app.RequirementColumn (ProjectId, Name, Kind, SortOrder, CreatedBy)
    VALUES (@ProjectId, @Name, @Kind, @Sort, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO app.RequirementColumnOption (RequirementColumnId, ProjectId, Label, SortOrder, CreatedBy)
    SELECT @Id, @ProjectId, Label, Place + 1, @ActorUserId FROM @Options;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.RequirementColumn', CAST(@Id AS NVARCHAR(64)),
            (SELECT @ProjectId AS projectId, @Name AS name, @Kind AS kind,
                    JSON_QUERY(@OptionsJson) AS options
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT RequirementColumnId, Name, Kind, SortOrder, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.RequirementColumn WHERE RequirementColumnId = @Id;
END;
GO
