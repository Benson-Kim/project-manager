-- usp_Decision_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Project ownership check: @ActorUserId must reach the record's project at Manager (FORBIDDEN_ROW 50003).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- The impacted areas and consulted stakeholders are left in place: they belong to the decision,
--   so restoring the row restores the whole record. A decision that supersedes this one keeps
--   pointing at it, which is what the minutes say happened.
-- Entity app.Decision (migration 057). Module: decisions (ADR-0055, BL36).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Decision_Delete
    @DecisionId  INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Decision WHERE DecisionId = @DecisionId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Decision not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'decisions:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    -- RowVer check INSIDE the transaction so the concurrency guard is atomic with the UPDATE.
    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Decision
         WHERE DecisionId = @DecisionId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
    BEGIN
        ROLLBACK;
        THROW 50001, N'NOT_FOUND:Decision not found', 1;
    END
    IF @CurrentVer <> @RowVer
    BEGIN
        ROLLBACK;
        THROW 50002, N'CONFLICT:Decision was modified by someone else', 1;
    END

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT DecisionId, [ProjectId], DecisionNumber, [Title], [DateLogged],
                [OwnerStakeholderId], [Status], [ProblemContext], [OptionsConsidered],
                [Rationale], [NextSteps], [SupersededByDecisionId]
         FROM app.Decision WHERE DecisionId = @DecisionId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Decision SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE DecisionId = @DecisionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Decision WHERE DecisionId = @DecisionId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Decision not found', 1;
        THROW 50002, N'CONFLICT:Decision was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Decision', CAST(@DecisionId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
