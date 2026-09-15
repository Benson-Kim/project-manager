-- usp_AssumptionConstraint_GetById — fetch one active app.AssumptionConstraint row; THROW 50001 when absent/soft-deleted.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_GetById
    @AssumptionConstraintId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:AssumptionConstraint not found', 1;

    SELECT AssumptionConstraintId,
           [ProjectId],
           [Type],
           [Description],
           [IsValidated],
           [Impact],
           [MitigationPlan],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.AssumptionConstraint
    WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0;
END;
GO
