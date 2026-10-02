-- usp_AssumptionConstraint_Create — insert one app.AssumptionConstraint row; audits in-transaction; returns the new row.
-- Project ownership check: @ActorUserId must be an assignee of the target project (FORBIDDEN_ROW 50003).
-- Admin role bypass: @ActorRole = N'Admin' skips the ProjectAssignee check.
-- Vocabulary enforcement: Type must be Assumption | Constraint | NULL; Impact must be High | Medium | Low | NULL.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: assumptions-constraints (#13).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_Create
    @ProjectId      INT,
    @Type           NVARCHAR(255)  = NULL,
    @Description    NVARCHAR(MAX)  = NULL,
    @IsValidated    BIT,
    @Impact         NVARCHAR(255)  = NULL,
    @MitigationPlan NVARCHAR(MAX)  = NULL,
    @ActorUserId    INT,
    @ActorRole      NVARCHAR(50)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;

    -- Vocabulary enforcement (mirrors z.enum in form schema; prevents forged payloads).
    IF @Type IS NOT NULL AND @Type NOT IN (N'Assumption', N'Constraint')
        THROW 50004, N'VALIDATION:Invalid type value', 1;

    IF @Impact IS NOT NULL AND @Impact NOT IN (N'High', N'Medium', N'Low')
        THROW 50004, N'VALIDATION:Invalid impact value', 1;

    -- Row-level access: the actor must be assigned to the project they are writing into.
    -- Admin users bypass this check (they have unrestricted access by role definition).
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @ProjectId AND UserId = @ActorUserId AND IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    BEGIN TRAN;

    INSERT INTO app.AssumptionConstraint ([ProjectId], [Type], [Description], [IsValidated], [Impact], [MitigationPlan], CreatedBy)
    VALUES (@ProjectId, @Type, @Description, @IsValidated, @Impact, @MitigationPlan, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.AssumptionConstraint', CAST(@Id AS NVARCHAR(64)),
            (SELECT AssumptionConstraintId, [ProjectId], [Type], [Description], [IsValidated], [Impact], [MitigationPlan]
             FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

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
    WHERE AssumptionConstraintId = @Id;
END;
GO
