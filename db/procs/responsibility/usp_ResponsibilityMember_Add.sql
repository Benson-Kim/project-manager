-- usp_ResponsibilityMember_Add — adds a stakeholder column at the end of a matrix. Matrix or
--   stakeholder of another project NOT_FOUND 50001; Manager with stakeholders:update (FORBIDDEN_ROW
--   50003); already a member or stale matrix RowVer CONFLICT 50002; the 41st member VALIDATION 50004.
--   The matrix row is locked (UPDLOCK) before counting, so parallel adds cannot pass the cap.
--   Returns the matrix's new RowVer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityMember_Add
    @ProjectId INT,
    @ResponsibilityMatrixId INT,
    @StakeholderId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @MaxMembers INT = 40;
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:update', @AllowProjectless = 0;

    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMatrix
                   WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Matrix not found', 1;

    IF NOT EXISTS (SELECT 1 FROM app.Stakeholder
                   WHERE StakeholderId = @StakeholderId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Stakeholder not found', 1;

    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMatrix WITH (UPDLOCK, ROWLOCK)
                   WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
        THROW 50002, N'CONFLICT:Matrix was modified by someone else', 1;

    IF EXISTS (SELECT 1 FROM app.ResponsibilityMember
               WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId)
        THROW 50002, N'CONFLICT:Stakeholder is already in this matrix', 1;

    IF (SELECT COUNT(*) FROM app.ResponsibilityMember
        WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId) >= @MaxMembers
        THROW 50004, N'VALIDATION:A matrix holds at most 40 stakeholders', 1;

    INSERT INTO app.ResponsibilityMember (ResponsibilityMatrixId, ProjectId, StakeholderId, SortOrder, CreatedBy)
    SELECT @ResponsibilityMatrixId, @ProjectId, @StakeholderId, ISNULL(MAX(SortOrder) + 1, 0), @ActorUserId
    FROM app.ResponsibilityMember WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId;

    UPDATE app.ResponsibilityMatrix SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ResponsibilityMember',
            CONCAT(@ResponsibilityMatrixId, N':', @StakeholderId), NULL,
            (SELECT ResponsibilityMatrixId, ProjectId, StakeholderId, SortOrder
             FROM app.ResponsibilityMember
             WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId;
END
GO
