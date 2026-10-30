-- usp_RiskIssue_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Project ownership check: @ActorUserId must reach the record's project at Manager (FORBIDDEN_ROW 50003).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: risks-issues (#14, ADR-0050).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_Delete
    @RiskIssueId INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'risks-issues:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    -- RowVer check INSIDE the transaction so the concurrency guard is atomic with the UPDATE
    -- (prevents a race window between the check and the write).
    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.RiskIssue
         WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
    BEGIN
        ROLLBACK;
        THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;
    END
    IF @CurrentVer <> @RowVer
    BEGIN
        ROLLBACK;
        THROW 50002, N'CONFLICT:RiskIssue was modified by someone else', 1;
    END

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT RiskIssueId, [ProjectId], [Description], [Category], [DateIdentified], [Status], [Priority], [Impact], [Probability], [MitigationPlan], [Owner], [DueDate]
         FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.RiskIssue SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;
        THROW 50002, N'CONFLICT:RiskIssue was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.RiskIssue', CAST(@RiskIssueId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
