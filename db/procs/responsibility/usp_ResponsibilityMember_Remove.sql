-- usp_ResponsibilityMember_Remove — removes a stakeholder column and its stored cells. WBS assignees
--   are left alone: the person stays assigned in the WBS and shows as a row hint. Matrix or member
--   NOT_FOUND 50001; Manager with stakeholders:update (FORBIDDEN_ROW 50003); stale matrix RowVer
--   CONFLICT 50002. Returns the matrix's new RowVer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityMember_Remove
    @ProjectId INT,
    @ResponsibilityMatrixId INT,
    @StakeholderId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:update', @AllowProjectless = 0;

    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMatrix
                   WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Matrix not found', 1;

    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMatrix WITH (UPDLOCK, ROWLOCK)
                   WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
        THROW 50002, N'CONFLICT:Matrix was modified by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT mb.ResponsibilityMatrixId, mb.ProjectId, mb.StakeholderId, mb.SortOrder,
                (SELECT a.KeyDeliverableId, a.DecisionId, a.RoleCode
                 FROM app.ResponsibilityAssignment a
                 WHERE a.ResponsibilityMatrixId = mb.ResponsibilityMatrixId AND a.StakeholderId = mb.StakeholderId
                 FOR JSON PATH) AS Cells
         FROM app.ResponsibilityMember mb
         WHERE mb.ResponsibilityMatrixId = @ResponsibilityMatrixId AND mb.StakeholderId = @StakeholderId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
    IF @Before IS NULL
        THROW 50001, N'NOT_FOUND:Stakeholder is not in this matrix', 1;

    DELETE FROM app.ResponsibilityAssignment
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId;

    DELETE FROM app.ResponsibilityMember
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId;

    UPDATE app.ResponsibilityMatrix SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.ResponsibilityMember',
            CONCAT(@ResponsibilityMatrixId, N':', @StakeholderId), @Before, NULL);

    COMMIT;

    SELECT CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId;
END
GO
