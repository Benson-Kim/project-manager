-- usp_ResponsibilityMatrix_Delete — soft-deletes one matrix; its members and cells stay for the
--   audit trail and are no longer listed. NOT_FOUND 50001; Manager with stakeholders:delete
--   (FORBIDDEN_ROW 50003); stale RowVer CONFLICT 50002.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityMatrix_Delete
    @ProjectId INT,
    @ResponsibilityMatrixId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:delete', @AllowProjectless = 0;

    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMatrix
                   WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Matrix not found', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ResponsibilityMatrixId, ProjectId, Name, FrameworkCode, RowKind
         FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ResponsibilityMatrix SET
        IsDeleted = 1,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId
      AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Matrix was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.ResponsibilityMatrix', CAST(@ResponsibilityMatrixId AS NVARCHAR(64)), @Before, NULL);

    COMMIT;
END
GO
