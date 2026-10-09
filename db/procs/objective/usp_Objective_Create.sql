-- usp_Objective_Create — insert one app.Objective row; audits in-transaction; returns the new row.
-- Row-level access: the target @ProjectId must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass).
-- Entity app.Objective (source: tblProjectObjectives). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Objective_Create
    @ProjectId INT,
    @QMeasurable NVARCHAR(255) = NULL,
    @QSuccess NVARCHAR(MAX) = NULL,
    @QAlignmentStrategy NVARCHAR(255) = NULL,
    @ObjectiveText NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @AllowProjectless = 0;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.Objective ([ProjectId], [QMeasurable], [QSuccess], [QAlignmentStrategy], [ObjectiveText], CreatedBy)
    VALUES (@ProjectId, @QMeasurable, @QSuccess, @QAlignmentStrategy, @ObjectiveText, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Objective', CAST(@Id AS NVARCHAR(64)),
            (SELECT ObjectiveId, [ProjectId], [QMeasurable], [QSuccess], [QAlignmentStrategy], [ObjectiveText]
             FROM app.Objective WHERE ObjectiveId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ObjectiveId,
           [ProjectId],
           [QMeasurable],
           [QSuccess],
           [QAlignmentStrategy],
           [ObjectiveText],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Objective
    WHERE ObjectiveId = @Id;
END;
GO
