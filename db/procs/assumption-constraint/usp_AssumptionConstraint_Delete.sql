-- usp_AssumptionConstraint_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_Delete
    @AssumptionConstraintId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:AssumptionConstraint not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:AssumptionConstraint was modified by someone else', 1;

    BEGIN TRAN;

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
