-- usp_Requirement_Create — add one requirement to a project (ADR-0037); answers with the new row.
-- Access: Contributor + requirements:create (dbo.usp_Project_AssertAccess, FORBIDDEN_ROW 50003).
-- The reference number is the next free one for this project, type and parent, deleted rows
--   counted, taken under the project lock so two parallel creates cannot pick the same one.
-- @ParentRequirementId makes this a sub-requirement of that row (ADR-0048): FR-1 gains FR-1.1.
--   Its type is then *inherited*, not chosen — whatever @RequirementType says is replaced by the
--   parent's, so a child can never drift from the letters its own reference carries. The caller
--   may leave @RequirementType NULL when it names a parent; a root still has to pick one.
--   The parent must be live and in this project, and @MaxDepth levels is the limit: the client
--   asked for none, so it is the most ufn_Requirement_AncestorPath walks and its references hold.
--   Both are checked under the project lock, since both read other rows.
--   Parentage is set here; the only later move is usp_Requirement_Delete taking a deleted row's
--   children up to that row's own parent, an ancestor of each, so a cycle stays unreachable
--   (ADR-0048).
-- Only a solution type carries a met tick; a need is stored unticked. That is applied after the
--   type is resolved, so a sub-requirement of a business requirement cannot arrive ticked.
-- @ValidatesIds / @KeyDeliverableIds are JSON arrays, handled by the Replace helpers inside this
--   transaction; NULL leaves that side empty. A refused id rolls the whole create back.
-- Planning fields (ADR-0052) are optional, so a caller from before migration 051 still creates a
--   row; usp_Requirement_AssertPlanning checks them under the project lock.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_Create
    @ProjectId           INT,
    @RequirementType     VARCHAR(3)     = NULL,
    @Requirement         NVARCHAR(4000),
    @IsMet               BIT            = 0,
    @ParentRequirementId INT            = NULL,
    @ValidatesIds        NVARCHAR(MAX)  = NULL,
    @KeyDeliverableIds   NVARCHAR(MAX)  = NULL,
    @MoSCoW              CHAR(1)        = NULL,
    @AcceptanceCriteria  NVARCHAR(MAX)  = NULL,
    @EstimateDays        DECIMAL(6, 1)  = NULL,
    @OwnerStakeholderId  INT            = NULL,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:create', @AllowProjectless = 0;

    IF @ParentRequirementId IS NULL
       AND (@RequirementType IS NULL OR @RequirementType NOT IN ('BR', 'SR', 'FR', 'NFR', 'TR', 'TC'))
        THROW 50004, N'VALIDATION:Pick a requirement type', 1;

    IF NULLIF(LTRIM(RTRIM(@Requirement)), N'') IS NULL
        THROW 50004, N'VALIDATION:A requirement is required', 1;

    SET @IsMet = ISNULL(@IsMet, 0);
    SET @AcceptanceCriteria = NULLIF(LTRIM(RTRIM(@AcceptanceCriteria)), N'');

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    EXEC dbo.usp_Requirement_AssertPlanning
         @ProjectId = @ProjectId, @MoSCoW = @MoSCoW, @AcceptanceCriteria = @AcceptanceCriteria,
         @EstimateDays = @EstimateDays, @OwnerStakeholderId = @OwnerStakeholderId;

    IF @ParentRequirementId IS NOT NULL
    BEGIN
        DECLARE @ParentType VARCHAR(3), @ParentDepth INT;
        DECLARE @MaxDepth INT = 50;

        SELECT @ParentType = RequirementType
        FROM app.Requirement
        WHERE RequirementId = @ParentRequirementId AND ProjectId = @ProjectId AND IsDeleted = 0;
        IF @ParentType IS NULL
            THROW 50001, N'NOT_FOUND:Requirement not found', 1;

        SELECT @ParentDepth = Depth FROM dbo.ufn_Requirement_AncestorPath(@ParentRequirementId);
        IF @ParentDepth >= @MaxDepth - 1
            THROW 50004, N'VALIDATION:A requirement can only go 50 levels deep', 1;

        SET @RequirementType = @ParentType;
    END

    IF @RequirementType IN ('BR', 'SR')
        SET @IsMet = 0;

    DECLARE @Number INT =
        ISNULL((SELECT MAX(Number) FROM app.Requirement
                WHERE ProjectId = @ProjectId AND RequirementType = @RequirementType
                  AND ((@ParentRequirementId IS NULL AND ParentRequirementId IS NULL)
                       OR ParentRequirementId = @ParentRequirementId)), 0) + 1;

    INSERT INTO app.Requirement (ProjectId, RequirementType, Number, ParentRequirementId,
                                 Requirement, IsMet, [MoSCoW], AcceptanceCriteria, EstimateDays,
                                 OwnerStakeholderId, CreatedBy)
    VALUES (@ProjectId, @RequirementType, @Number, @ParentRequirementId,
            LTRIM(RTRIM(@Requirement)), @IsMet, @MoSCoW, @AcceptanceCriteria, @EstimateDays,
            @OwnerStakeholderId, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    IF @ValidatesIds IS NOT NULL
        EXEC dbo.usp_Requirement_ReplaceTraces
             @RequirementId = @Id, @Ids = @ValidatesIds, @ActorUserId = @ActorUserId;

    IF @KeyDeliverableIds IS NOT NULL
        EXEC dbo.usp_Requirement_ReplaceAllocations
             @RequirementId = @Id, @Ids = @KeyDeliverableIds, @ActorUserId = @ActorUserId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Requirement', CAST(@Id AS NVARCHAR(64)),
            (SELECT RequirementId, ProjectId, RequirementType, Number, ParentRequirementId,
                    Requirement, IsMet, [MoSCoW], AcceptanceCriteria, EstimateDays, OwnerStakeholderId
             FROM app.Requirement WHERE RequirementId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    EXEC dbo.usp_Requirement_GetById @RequirementId = @Id, @ActorUserId = @ActorUserId;
END;
GO
