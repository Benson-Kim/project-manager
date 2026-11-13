-- usp_ResponsibilityMatrix_Create — adds a responsibility matrix to a project. @RowKind NULL takes the
--   framework's default. Manager with stakeholders:create (FORBIDDEN_ROW 50003); unknown framework,
--   bad row kind or blank name VALIDATION 50004; a live matrix of the same name CONFLICT 50002.
--   Returns the new id and RowVer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityMatrix_Create
    @ProjectId INT,
    @Name NVARCHAR(100),
    @FrameworkCode NVARCHAR(16),
    @RowKind NVARCHAR(16) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Name = LTRIM(RTRIM(@Name));
    IF @Name IS NULL OR @Name = N''
        THROW 50004, N'VALIDATION:Name is required', 1;

    DECLARE @DefaultRowKind NVARCHAR(16);
    SELECT @DefaultRowKind = DefaultRowKind
    FROM app.ResponsibilityFramework WHERE FrameworkCode = @FrameworkCode;
    IF @@ROWCOUNT = 0
        THROW 50004, N'VALIDATION:Unknown framework', 1;

    SET @RowKind = COALESCE(@RowKind, @DefaultRowKind);
    IF @RowKind NOT IN (N'WbsItem', N'Decision')
        THROW 50004, N'VALIDATION:Rows are WBS items or decisions', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:create', @AllowProjectless = 0;

    BEGIN TRAN;

    IF EXISTS (SELECT 1 FROM app.ResponsibilityMatrix WITH (UPDLOCK, HOLDLOCK)
               WHERE ProjectId = @ProjectId AND Name = @Name AND IsDeleted = 0)
        THROW 50002, N'CONFLICT:A matrix with this name already exists', 1;

    INSERT INTO app.ResponsibilityMatrix (ProjectId, Name, FrameworkCode, RowKind, CreatedBy)
    VALUES (@ProjectId, @Name, @FrameworkCode, @RowKind, @ActorUserId);

    DECLARE @Id INT = CAST(SCOPE_IDENTITY() AS INT);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ResponsibilityMatrix', CAST(@Id AS NVARCHAR(64)), NULL,
            (SELECT ResponsibilityMatrixId, ProjectId, Name, FrameworkCode, RowKind
             FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ResponsibilityMatrixId, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @Id;
END
GO
