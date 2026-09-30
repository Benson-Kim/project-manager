-- usp_RiskIssue_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.RiskIssue (source: tblRisksIssuesTracker). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RiskIssue_Delete
    @RiskIssueId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.RiskIssue WHERE RiskIssueId = @RiskIssueId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:RiskIssue not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:RiskIssue was modified by someone else', 1;

    BEGIN TRAN;

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
