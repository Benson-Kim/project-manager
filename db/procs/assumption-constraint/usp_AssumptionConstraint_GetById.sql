-- usp_AssumptionConstraint_GetById — fetch one active app.AssumptionConstraint row; THROW 50001 when absent/soft-deleted.
-- Row-level access: @ActorUserId must be an assignee of the record's project (FORBIDDEN_ROW 50003).
-- Admin role bypass: @ActorRole = N'Admin' skips the ProjectAssignee check.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: assumptions-constraints (#13).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_GetById
    @AssumptionConstraintId INT,
    @ActorUserId            INT,
    @ActorRole              NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:AssumptionConstraint not found', 1;

    -- Row-level access: the actor must be assigned to the record's project.
    -- Admin users bypass this check (they have unrestricted access by role definition).
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.AssumptionConstraint ac
           JOIN app.ProjectAssignee pa ON pa.ProjectId = ac.ProjectId AND pa.UserId = @ActorUserId AND pa.IsDeleted = 0
           WHERE ac.AssumptionConstraintId = @AssumptionConstraintId AND ac.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

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
