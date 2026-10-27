-- usp_Requirement_Update — change one requirement's type, wording and met tick, and optionally
-- replace its links or its allocations (ADR-0037); answers with the row.
-- Access: Contributor + requirements:update. CONFLICT 50002 on a stale RowVer.
-- @ValidatesSet / @DeliverablesSet follow the @ColorSet pattern: that side is replaced only when
--   its flag is 1, so a datasheet cell edit leaves links and allocations alone.
-- A type change takes the next free number of the new type, among that type's *roots*: a
--   sub-requirement's number is unique under its parent, not across the type (ADR-0048).
-- Two type changes are refused outright rather than cascaded (ADR-0048):
--   * a sub-requirement's type is its parent's, so it has none of its own to change;
--   * a requirement that still has sub-requirements cannot change type, because every one of their
--     references carries its letters and would silently become something the client never renamed.
--   Both are checked under the project lock, since both read other rows. Refusing is reversible —
--   the client has been asked whether children should instead follow the parent.
-- Nothing here re-parents a requirement: parentage is usp_Requirement_Create's alone.
-- The rules are checked on the resulting state, after the scalars and both lists are written, so a
--   save that changes type and links together is judged as a whole. A refusal rolls it all back.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_Update
    @RequirementId     INT,
    @RequirementType   VARCHAR(3),
    @Requirement       NVARCHAR(4000),
    @IsMet             BIT,
    @ValidatesSet      BIT           = 0,
    @ValidatesIds      NVARCHAR(MAX) = NULL,
    @DeliverablesSet   BIT           = 0,
    @KeyDeliverableIds NVARCHAR(MAX) = NULL,
    @RowVer            BIGINT,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @OldType VARCHAR(3), @OldNumber INT,
            @OldParentId INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId,
           @OldType = RequirementType, @OldNumber = Number, @OldParentId = ParentRequirementId
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @RequirementType IS NULL OR @RequirementType NOT IN ('BR', 'SR', 'FR', 'NFR', 'TR')
        THROW 50004, N'VALIDATION:Pick a requirement type', 1;

    IF NULLIF(LTRIM(RTRIM(@Requirement)), N'') IS NULL
        THROW 50004, N'VALIDATION:A requirement is required', 1;

    SET @IsMet = ISNULL(@IsMet, 0);
    IF @RequirementType NOT IN ('FR', 'NFR', 'TR')
        SET @IsMet = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    DECLARE @Number INT = @OldNumber;
    IF @RequirementType <> @OldType
    BEGIN
        IF @OldParentId IS NOT NULL
            THROW 50004, N'VALIDATION:A sub-requirement takes its type from the requirement above it', 1;

        IF EXISTS (SELECT 1 FROM app.Requirement
                   WHERE ParentRequirementId = @RequirementId AND IsDeleted = 0)
            THROW 50004, N'VALIDATION:Remove the sub-requirements before changing this type', 1;

        SET @Number =
            ISNULL((SELECT MAX(Number) FROM app.Requirement
                    WHERE ProjectId = @RowProjectId AND RequirementType = @RequirementType
                      AND ParentRequirementId IS NULL), 0) + 1;
    END

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT RequirementId, ProjectId, RequirementType, Number, ParentRequirementId,
                Requirement, IsMet
         FROM app.Requirement WHERE RequirementId = @RequirementId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Requirement SET
        RequirementType = @RequirementType,
        Number          = @Number,
        Requirement     = LTRIM(RTRIM(@Requirement)),
        IsMet           = @IsMet,
        UpdatedAtUtc    = SYSUTCDATETIME(),
        UpdatedBy       = @ActorUserId
    WHERE RequirementId = @RequirementId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Requirement not found', 1;
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;
    END

    IF @ValidatesSet = 1
        EXEC dbo.usp_Requirement_ReplaceTraces
             @RequirementId = @RequirementId, @Ids = @ValidatesIds, @ActorUserId = @ActorUserId;

    IF @DeliverablesSet = 1
        EXEC dbo.usp_Requirement_ReplaceAllocations
             @RequirementId = @RequirementId, @Ids = @KeyDeliverableIds, @ActorUserId = @ActorUserId;

    IF @RequirementType NOT IN ('FR', 'NFR', 'TR')
    BEGIN
        IF EXISTS (SELECT 1 FROM app.RequirementTrace WHERE RequirementId = @RequirementId)
            THROW 50004, N'VALIDATION:This requirement still validates another one', 1;
        IF EXISTS (SELECT 1 FROM app.RequirementDeliverable WHERE RequirementId = @RequirementId)
            THROW 50004, N'VALIDATION:This requirement is still on a deliverable', 1;
    END
    ELSE
    BEGIN
        IF EXISTS (SELECT 1 FROM app.RequirementTrace WHERE ValidatesRequirementId = @RequirementId)
            THROW 50004, N'VALIDATION:Another requirement still validates this one', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Requirement',
            CAST(@RequirementId AS NVARCHAR(64)), @Before,
            (SELECT RequirementId, ProjectId, RequirementType, Number, ParentRequirementId,
                    Requirement, IsMet
             FROM app.Requirement WHERE RequirementId = @RequirementId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    EXEC dbo.usp_Requirement_GetById @RequirementId = @RequirementId, @ActorUserId = @ActorUserId;
END;
GO
