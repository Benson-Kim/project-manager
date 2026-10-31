-- usp_KeyDeliverable_SetPlanNote — replace the project's plan note, the sticky note beside the work
-- breakdown chart (ADR-0052); returns the project's new RowVer. Blank text clears it.
-- It is part of the plan, not of the project's details, so it takes the plan's permission
--   (Manager + key-deliverables:update) rather than projects:update, and usp_Project_Update never
--   writes it. It still carries the project's RowVer: a stale note save is CONFLICT 50002, never a
--   silent overwrite.
-- At most 8000 characters. The column is MAX so a later limit change needs no migration.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_SetPlanNote
    @ProjectId   INT,
    @PlanNote    NVARCHAR(MAX),
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Project was modified by someone else', 1;

    SET @PlanNote = NULLIF(RTRIM(@PlanNote), N'');
    IF LEN(@PlanNote) > 8000
        THROW 50004, N'VALIDATION:A note can be at most 8000 characters', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT PlanNote FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.Project SET
        PlanNote     = @PlanNote,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE ProjectId = @ProjectId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Project was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Project', CAST(@ProjectId AS NVARCHAR(64)), @Before,
            (SELECT @PlanNote AS PlanNote FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT CAST(RowVer AS BIGINT) AS RowVer FROM app.Project WHERE ProjectId = @ProjectId;
END;
GO
