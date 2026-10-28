-- usp_Requirement_Create — add one requirement to a project (ADR-0037); answers with the new row.
-- Access: Contributor + requirements:create (dbo.usp_Project_AssertAccess, FORBIDDEN_ROW 50003).
-- The reference number is the next free one for this project, type and parent, deleted rows
--   counted, taken under the project lock so two parallel creates cannot pick the same one.
-- @ParentRequirementId makes this a sub-requirement of that row (ADR-0048): FR-1 gains FR-1.1.
--   Its type is then *inherited*, not chosen — whatever @RequirementType says is replaced by the
--   parent's, so a child can never drift from the letters its own reference carries. The caller
--   may leave @RequirementType NULL when it names a parent; a root still has to pick one.
--   The parent must be live and in this project, and four levels is the limit. Both are checked
--   under the project lock, since both read other rows.
--   Parentage is set here and by nothing else: no proc re-parents a requirement, which is what
--   makes a cycle unreachable without a second row to point at (ADR-0048).
-- Only a solution type carries a met tick; a need is stored unticked. That is applied after the
--   type is resolved, so a sub-requirement of a business requirement cannot arrive ticked.
-- @ValidatesIds / @KeyDeliverableIds are JSON arrays, handled by the Replace helpers inside this
--   transaction; NULL leaves that side empty. A refused id rolls the whole create back.
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
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:create', @AllowProjectless = 0;

    IF @ParentRequirementId IS NULL
       AND (@RequirementType IS NULL OR @RequirementType NOT IN ('BR', 'SR', 'FR', 'NFR', 'TR'))
        THROW 50004, N'VALIDATION:Pick a requirement type', 1;

    IF NULLIF(LTRIM(RTRIM(@Requirement)), N'') IS NULL
        THROW 50004, N'VALIDATION:A requirement is required', 1;

    SET @IsMet = ISNULL(@IsMet, 0);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    IF @ParentRequirementId IS NOT NULL
    BEGIN
        DECLARE @ParentType VARCHAR(3), @ParentDepth INT;

        SELECT @ParentType = RequirementType
        FROM app.Requirement
        WHERE RequirementId = @ParentRequirementId AND ProjectId = @ProjectId AND IsDeleted = 0;
        IF @ParentType IS NULL
            THROW 50001, N'NOT_FOUND:Requirement not found', 1;

        SELECT @ParentDepth = Depth FROM dbo.ufn_Requirement_AncestorPath(@ParentRequirementId);
        IF @ParentDepth >= 3
            THROW 50004, N'VALIDATION:A requirement can only go four levels deep', 1;

        SET @RequirementType = @ParentType;
    END

    IF @RequirementType NOT IN ('FR', 'NFR', 'TR')
        SET @IsMet = 0;

    DECLARE @Number INT =
        ISNULL((SELECT MAX(Number) FROM app.Requirement
                WHERE ProjectId = @ProjectId AND RequirementType = @RequirementType
                  AND ((@ParentRequirementId IS NULL AND ParentRequirementId IS NULL)
                       OR ParentRequirementId = @ParentRequirementId)), 0) + 1;

    INSERT INTO app.Requirement (ProjectId, RequirementType, Number, ParentRequirementId,
                                 Requirement, IsMet, CreatedBy)
    VALUES (@ProjectId, @RequirementType, @Number, @ParentRequirementId,
            LTRIM(RTRIM(@Requirement)), @IsMet, @ActorUserId);

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
                    Requirement, IsMet
             FROM app.Requirement WHERE RequirementId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    EXEC dbo.usp_Requirement_GetById @RequirementId = @Id, @ActorUserId = @ActorUserId;
END;
GO
