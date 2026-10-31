-- usp_BoardCard_LinkRequirement — attach or detach a requirement to/from an existing card.
-- Returns the card. NULL @RequirementId removes the link (unlinks).
-- What it deliberately does NOT take: any other card field. Linking is its own intention,
--   separate from editing (usp_BoardCard_Update) and packaging (usp_BoardCard_Package).
-- Write order (ADR-0038): lock the board row, THEN assert access.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess),
--   CONFLICT 50002 on a stale RowVer.
-- A card that loses its requirement must still have a title or a deliverable (CK_BoardCard_Content). The proc
--   checks before the constraint can fire, so the error reads as VALIDATION rather than INTERNAL.
-- A card that carries a deliverable takes no requirement (VALIDATION): its drawer lists the
--   deliverable's own.
-- When linking, the requirement must exist, belong to the board's project (or any project when
--   the board has no project), and not already be linked to another live card on this board
--   (UQ_BoardCard_Requirement).
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_LinkRequirement
    @BoardCardId    INT,
    @RowVer         BIGINT,
    @RequirementId  INT = NULL,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Card not found', 1;

    BEGIN TRAN;

    DECLARE @Lock INT, @ProjectId INT;
    SELECT @Lock = BoardId, @ProjectId = ProjectId
    FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    DECLARE @Title NVARCHAR(300), @OldRequirementId INT, @KeyDeliverableId INT, @Found BIT = 0;
    SELECT @Title = Title, @OldRequirementId = RequirementId, @KeyDeliverableId = KeyDeliverableId,
           @Found = 1
    FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @Found = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardCard WHERE BoardCardId = @BoardCardId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Card not found', 1;
        THROW 50002, N'CONFLICT:The card was changed by someone else', 1;
    END;

    -- Unlinking: the card must still have content.
    IF @RequirementId IS NULL AND @Title IS NULL AND @KeyDeliverableId IS NULL
        THROW 50004, N'VALIDATION:A card without a requirement needs a title', 1;

    -- A deliverable card shows its deliverable's requirements; it never carries one of its own.
    IF @RequirementId IS NOT NULL AND @KeyDeliverableId IS NOT NULL
        THROW 50004, N'VALIDATION:A deliverable card cannot also carry a requirement', 1;

    -- Linking: validate the requirement.
    IF @RequirementId IS NOT NULL
    BEGIN
        DECLARE @RequirementProject INT;
        SELECT @RequirementProject = ProjectId
        FROM app.Requirement WITH (UPDLOCK, HOLDLOCK)
        WHERE RequirementId = @RequirementId AND IsDeleted = 0;
        IF @RequirementProject IS NULL
            THROW 50001, N'NOT_FOUND:Requirement not found', 1;

        -- The requirement's project must match the board's project (or the board has no project).
        IF @ProjectId IS NOT NULL AND @ProjectId <> @RequirementProject
            THROW 50004, N'VALIDATION:The requirement must belong to the board project', 1;

        EXEC dbo.usp_Project_AssertAccess
            @ProjectId = @RequirementProject, @ActorUserId = @ActorUserId,
            @MinLevel = N'Viewer', @Permission = N'requirements:read', @AllowProjectless = 0;

        -- Another live card on this board must not already carry this requirement.
        IF EXISTS (
            SELECT 1 FROM app.BoardCard
            WHERE BoardId = @BoardId AND RequirementId = @RequirementId
              AND IsDeleted = 0 AND BoardCardId <> @BoardCardId
        )
            THROW 50004, N'VALIDATION:Another card on this board already has that requirement', 1;
    END;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT RequirementId
         FROM app.BoardCard WHERE BoardCardId = @BoardCardId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.BoardCard SET
        RequirementId = @RequirementId,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE BoardCardId = @BoardCardId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'LinkRequirement', N'app.BoardCard', CAST(@BoardCardId AS NVARCHAR(64)), @Before,
            (SELECT RequirementId
             FROM app.BoardCard WHERE BoardCardId = @BoardCardId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT BoardCardId,
           BoardId,
           BoardColumnId,
           BoardSprintId,
           RequirementId,
           KeyDeliverableId,
           Title,
           AssigneeUserId,
           DueDate,
           StoryPoints,
           Color,
           SortKey,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId;
END;
GO
