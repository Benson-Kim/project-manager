-- usp_ResponsibilityMatrix_Rename — renames one matrix. NOT_FOUND 50001; Manager with
--   stakeholders:update (FORBIDDEN_ROW 50003); blank name VALIDATION 50004; stale RowVer or a live
--   matrix of the same name CONFLICT 50002. Returns the new RowVer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityMatrix_Rename
    @ProjectId INT,
    @ResponsibilityMatrixId INT,
    @Name NVARCHAR(100),
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Name = LTRIM(RTRIM(@Name));
    IF @Name IS NULL OR @Name = N''
        THROW 50004, N'VALIDATION:Name is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:update', @AllowProjectless = 0;

    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMatrix
                   WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Matrix not found', 1;

    BEGIN TRAN;

    IF EXISTS (SELECT 1 FROM app.ResponsibilityMatrix WITH (UPDLOCK, HOLDLOCK)
               WHERE ProjectId = @ProjectId AND Name = @Name AND IsDeleted = 0
                 AND ResponsibilityMatrixId <> @ResponsibilityMatrixId)
        THROW 50002, N'CONFLICT:A matrix with this name already exists', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ResponsibilityMatrixId, ProjectId, Name
         FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ResponsibilityMatrix SET
        Name = @Name,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Matrix was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ResponsibilityMatrix', CAST(@ResponsibilityMatrixId AS NVARCHAR(64)), @Before,
            (SELECT ResponsibilityMatrixId, ProjectId, Name
             FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId;
END
GO
