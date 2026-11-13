-- usp_ResponsibilityMember_Move — moves a stakeholder column to a 0-based position (clamped to the
--   end) and renumbers the columns 0..n-1. Matrix or member NOT_FOUND 50001; Manager with
--   stakeholders:update (FORBIDDEN_ROW 50003); stale matrix RowVer CONFLICT 50002; negative position
--   VALIDATION 50004. Returns the matrix's new RowVer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityMember_Move
    @ProjectId INT,
    @ResponsibilityMatrixId INT,
    @StakeholderId INT,
    @Position INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Position IS NULL OR @Position < 0
        THROW 50004, N'VALIDATION:Position must be zero or more', 1;

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

    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMember
                   WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId)
        THROW 50001, N'NOT_FOUND:Stakeholder is not in this matrix', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT StakeholderId, SortOrder FROM app.ResponsibilityMember
         WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId ORDER BY SortOrder, StakeholderId FOR JSON PATH);

    DECLARE @Others INT =
        (SELECT COUNT(*) FROM app.ResponsibilityMember
         WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId <> @StakeholderId);
    IF @Position > @Others SET @Position = @Others;

    WITH ordered AS (
        SELECT SortOrder, ROW_NUMBER() OVER (ORDER BY SortOrder, StakeholderId) - 1 AS Rn
        FROM app.ResponsibilityMember
        WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId <> @StakeholderId)
    UPDATE ordered SET SortOrder = CASE WHEN Rn < @Position THEN Rn ELSE Rn + 1 END;

    UPDATE app.ResponsibilityMember SET SortOrder = @Position
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId;

    UPDATE app.ResponsibilityMatrix SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ResponsibilityMember',
            CONCAT(@ResponsibilityMatrixId, N':', @StakeholderId), @Before,
            (SELECT StakeholderId, SortOrder FROM app.ResponsibilityMember
             WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId ORDER BY SortOrder, StakeholderId FOR JSON PATH));

    COMMIT;

    SELECT CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ResponsibilityMatrix WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId;
END
GO
