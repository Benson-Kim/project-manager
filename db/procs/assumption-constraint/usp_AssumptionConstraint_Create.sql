-- usp_AssumptionConstraint_Create — insert one app.AssumptionConstraint row; audits in-transaction; returns the new row.
-- Entity app.AssumptionConstraint (source: tblAssumptionsConstraints). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AssumptionConstraint_Create
    @ProjectId INT,
    @Type NVARCHAR(255) = NULL,
    @Description NVARCHAR(MAX) = NULL,
    @IsValidated BIT,
    @Impact NVARCHAR(255) = NULL,
    @MitigationPlan NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
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
