-- usp_AssumptionConstraint_Create — insert one app.AssumptionConstraint row; audits in-transaction; returns the new row.
-- Project ownership check: @ActorUserId must be an assignee of the target project (FORBIDDEN_ROW 50003).
-- Admin role bypass: an Admin actor (role read from auth.User) skips the ProjectAssignee check.
-- Vocabulary enforcement: Type must be Assumption | Constraint | NULL; Impact must be High | Medium | Low | NULL.
-- Dropdown values (ADR-0022): Type, Impact and Validated must be live options of their lists
--   (VALIDATION 50004), and are stored as listed.
-- [IsValidated] is derived, not supplied (migration 053, ADR-0054): the Validated list's Yes is
--   the locked label it reads, so the retained BIT stays correct for a rolled-back release.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: assumptions-constraints (#13).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_Create
    @ProjectId      INT,
    @Type           NVARCHAR(255)  = NULL,
    @Description    NVARCHAR(MAX)  = NULL,
    @Validated      NVARCHAR(50)   = NULL,
    @Impact         NVARCHAR(255)  = NULL,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'assumptions-constraints:create', @AllowProjectless = 0;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'assumption-constraint.type', @Label = @Type OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'assumption-constraint.impact', @Label = @Impact OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'assumption-constraint.validated', @Label = @Validated OUTPUT;

    BEGIN TRAN;

    INSERT INTO app.AssumptionConstraint ([ProjectId], [Type], [Description], [Validated], [IsValidated], [Impact], CreatedBy)
    VALUES (@ProjectId, @Type, @Description, @Validated,
            CASE WHEN @Validated = N'Yes' THEN 1 ELSE 0 END, @Impact, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.AssumptionConstraint', CAST(@Id AS NVARCHAR(64)),
            (SELECT AssumptionConstraintId, [ProjectId], [Type], [Description], [Validated], [IsValidated], [Impact], [MitigationPlan]
             FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT AssumptionConstraintId,
           [ProjectId],
           [Type],
           [Description],
           [Validated],
           [Impact],
           [MitigationPlan],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.AssumptionConstraint
    WHERE AssumptionConstraintId = @Id;
END;
GO
