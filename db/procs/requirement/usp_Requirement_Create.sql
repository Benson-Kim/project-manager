-- usp_Requirement_Create — add one requirement to a project (ADR-0037); answers with the new row.
-- Access: Contributor + requirements:create (dbo.usp_Project_AssertAccess, FORBIDDEN_ROW 50003).
-- The reference number is the next free one for this project and type, deleted rows counted, taken
--   under the project lock so two parallel creates cannot pick the same one.
-- Only a solution type carries a met tick; a need is stored unticked.
-- @ValidatesIds / @KeyDeliverableIds are JSON arrays, handled by the Replace helpers inside this
--   transaction; NULL leaves that side empty. A refused id rolls the whole create back.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_Create
    @ProjectId         INT,
    @RequirementType   VARCHAR(3),
    @Requirement       NVARCHAR(4000),
    @IsMet             BIT            = 0,
    @ValidatesIds      NVARCHAR(MAX)  = NULL,
    @KeyDeliverableIds NVARCHAR(MAX)  = NULL,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:create', @AllowProjectless = 0;

    IF @RequirementType IS NULL OR @RequirementType NOT IN ('BR', 'SR', 'FR', 'NFR', 'TR')
        THROW 50004, N'VALIDATION:Pick a requirement type', 1;

    IF NULLIF(LTRIM(RTRIM(@Requirement)), N'') IS NULL
        THROW 50004, N'VALIDATION:A requirement is required', 1;

    SET @IsMet = ISNULL(@IsMet, 0);
    IF @RequirementType NOT IN ('FR', 'NFR', 'TR')
        SET @IsMet = 0;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    DECLARE @Number INT =
        ISNULL((SELECT MAX(Number) FROM app.Requirement
                WHERE ProjectId = @ProjectId AND RequirementType = @RequirementType), 0) + 1;

    INSERT INTO app.Requirement (ProjectId, RequirementType, Number, Requirement, IsMet, CreatedBy)
    VALUES (@ProjectId, @RequirementType, @Number, LTRIM(RTRIM(@Requirement)), @IsMet, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    IF @ValidatesIds IS NOT NULL
        EXEC dbo.usp_Requirement_ReplaceTraces
             @RequirementId = @Id, @Ids = @ValidatesIds, @ActorUserId = @ActorUserId;

    IF @KeyDeliverableIds IS NOT NULL
        EXEC dbo.usp_Requirement_ReplaceAllocations
             @RequirementId = @Id, @Ids = @KeyDeliverableIds, @ActorUserId = @ActorUserId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Requirement', CAST(@Id AS NVARCHAR(64)),
            (SELECT RequirementId, ProjectId, RequirementType, Number, Requirement, IsMet
             FROM app.Requirement WHERE RequirementId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    EXEC dbo.usp_Requirement_GetById @RequirementId = @Id, @ActorUserId = @ActorUserId;
END;
GO
