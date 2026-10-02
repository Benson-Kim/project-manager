-- usp_AssumptionConstraint_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Project ownership check: @ActorUserId must be an assignee of the record's current project (FORBIDDEN_ROW 50003).
-- Admin role bypass: @ActorRole = N'Admin' skips the ProjectAssignee check.
-- ProjectId is immutable: the stored project is always kept; @ProjectId is accepted for
--   the action-layer form contract but ignored (prevents cross-project record relocation
--   via forged payload — Codex review comment #4162765942).
-- Vocabulary enforcement: Type must be Assumption | Constraint | NULL; Impact must be High | Medium | Low | NULL.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: assumptions-constraints (#13).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_Update
    @AssumptionConstraintId INT,
    @ProjectId              INT,          -- accepted but ignored; ProjectId is immutable
    @Type                   NVARCHAR(255)  = NULL,
    @Description            NVARCHAR(MAX)  = NULL,
    @IsValidated            BIT,
    @Impact                 NVARCHAR(255)  = NULL,
    @MitigationPlan         NVARCHAR(MAX)  = NULL,
    @RowVer                 BIGINT,
    @ActorUserId            INT,
    @ActorRole              NVARCHAR(50)   = NULL
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

    -- Vocabulary enforcement (mirrors z.enum in form schema; prevents forged payloads).
    IF @Type IS NOT NULL AND @Type NOT IN (N'Assumption', N'Constraint')
        THROW 50004, N'VALIDATION:Invalid type value', 1;

    IF @Impact IS NOT NULL AND @Impact NOT IN (N'High', N'Medium', N'Low')
        THROW 50004, N'VALIDATION:Invalid impact value', 1;

    -- Row-level access: the actor must be assigned to the current project.
    -- Admin users bypass this check.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.AssumptionConstraint ac
           JOIN app.ProjectAssignee pa ON pa.ProjectId = ac.ProjectId AND pa.UserId = @ActorUserId AND pa.IsDeleted = 0
           WHERE ac.AssumptionConstraintId = @AssumptionConstraintId AND ac.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT AssumptionConstraintId, [ProjectId], [Type], [Description], [IsValidated], [Impact], [MitigationPlan]
         FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.AssumptionConstraint SET
        -- ProjectId intentionally omitted — immutable after creation.
        [Type] = @Type,
        [Description] = @Description,
        [IsValidated] = @IsValidated,
        [Impact] = @Impact,
        [MitigationPlan] = @MitigationPlan,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:AssumptionConstraint not found', 1;
        THROW 50002, N'CONFLICT:AssumptionConstraint was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.AssumptionConstraint', CAST(@AssumptionConstraintId AS NVARCHAR(64)), @Before,
            (SELECT AssumptionConstraintId, [ProjectId], [Type], [Description], [IsValidated], [Impact], [MitigationPlan]
             FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @AssumptionConstraintId
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
    WHERE AssumptionConstraintId = @AssumptionConstraintId;
END;
GO
