-- usp_AssumptionConstraint_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Project ownership check: @ActorUserId must be an assignee of the target project (FORBIDDEN_ROW 50003).
-- Admin role bypass: @ActorRole = N'Admin' skips the ProjectAssignee check.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: assumptions-constraints (#13).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_Delete
    @AssumptionConstraintId INT,
    @RowVer                 BIGINT,
    @ActorUserId            INT,
    @ActorRole              NVARCHAR(50)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Row-level access checked before opening the transaction (read-only, no locking needed).
    -- Admin users bypass this check.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.AssumptionConstraint ac
           JOIN app.ProjectAssignee pa ON pa.ProjectId = ac.ProjectId AND pa.UserId = @ActorUserId AND pa.IsDeleted = 0
           WHERE ac.AssumptionConstraintId = @AssumptionConstraintId AND ac.IsDeleted = 0
       )
    BEGIN
        -- Distinguish NOT_FOUND from FORBIDDEN_ROW so the caller sees the right code.
        IF NOT EXISTS (SELECT 1 FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:AssumptionConstraint not found', 1;
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;
    END

    BEGIN TRAN;

    -- RowVer check INSIDE the transaction so the concurrency guard is atomic
    -- with the UPDATE (prevents race window between check and write — M3 fix).
    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.AssumptionConstraint
         WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
    BEGIN
        ROLLBACK;
        THROW 50001, N'NOT_FOUND:AssumptionConstraint not found', 1;
    END
    IF @CurrentVer <> @RowVer
    BEGIN
        ROLLBACK;
        THROW 50002, N'CONFLICT:AssumptionConstraint was modified by someone else', 1;
    END

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT AssumptionConstraintId, [ProjectId], [Type], [Description], [IsValidated], [Impact], [MitigationPlan]
         FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.AssumptionConstraint SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:AssumptionConstraint not found', 1;
        THROW 50002, N'CONFLICT:AssumptionConstraint was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.AssumptionConstraint', CAST(@AssumptionConstraintId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
