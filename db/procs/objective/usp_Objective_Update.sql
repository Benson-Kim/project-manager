-- usp_Objective_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass). The project key is immutable:
--   @ProjectId is accepted but ignored (DB standard).
-- Entity app.Objective (source: tblProjectObjectives). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Objective_Update
    @ObjectiveId INT,
    @ProjectId INT,
    @QMeasurable NVARCHAR(255) = NULL,
    @QSuccess NVARCHAR(MAX) = NULL,
    @QAlignmentStrategy NVARCHAR(255) = NULL,
    @ObjectiveText NVARCHAR(MAX) = NULL,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId
    FROM app.Objective WHERE ObjectiveId = @ObjectiveId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Objective not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'objectives:update', @AllowProjectless = 0;
    SET @ProjectId = @RowProjectId;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Objective was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ObjectiveId, [ProjectId], [QMeasurable], [QSuccess], [QAlignmentStrategy], [ObjectiveText]
         FROM app.Objective WHERE ObjectiveId = @ObjectiveId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Objective SET
        [ProjectId] = @ProjectId,
        [QMeasurable] = @QMeasurable,
        [QSuccess] = @QSuccess,
        [QAlignmentStrategy] = @QAlignmentStrategy,
        [ObjectiveText] = @ObjectiveText,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE ObjectiveId = @ObjectiveId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Objective WHERE ObjectiveId = @ObjectiveId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Objective not found', 1;
        THROW 50002, N'CONFLICT:Objective was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Objective', CAST(@ObjectiveId AS NVARCHAR(64)), @Before,
            (SELECT ObjectiveId, [ProjectId], [QMeasurable], [QSuccess], [QAlignmentStrategy], [ObjectiveText]
             FROM app.Objective WHERE ObjectiveId = @ObjectiveId
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
    WHERE ObjectiveId = @ObjectiveId;
END;
GO
