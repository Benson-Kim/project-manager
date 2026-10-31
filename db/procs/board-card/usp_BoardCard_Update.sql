-- usp_BoardCard_Update — edit one card's own fields: title, notes, assignee, due date, story points
-- and colour. Returns the card.
-- What it deliberately does NOT take: BoardId, BoardColumnId, BoardSprintId, RequirementId,
--   CreatedBy and SortKey. Moving a card is dbo.usp_BoardCard_Move (which checks the WIP limit),
--   packaging is dbo.usp_BoardCard_Package, and the rest are the server's. A card therefore cannot
--   be moved, re-boarded or attached to a requirement through an edit, whatever a payload carries.
-- Write order (ADR-0038): lock the board row, THEN assert access. No WIP check: an edit cannot
--   change which column the card is in.
-- Row-level access: Contributor on the board with 'boards:update' (dbo.usp_Board_AssertAccess),
--   CONFLICT 50002 on a stale RowVer.
-- A packaged card may clear its title and show the requirement's or deliverable's text instead
--   (ADR-0052); an unpackaged one may not, or it would have nothing to show. That is CK_BoardCard_Content, checked here first so
--   it reads as VALIDATION rather than surfacing error 547 as INTERNAL.
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_Update
    @BoardCardId    INT,
    @RowVer         BIGINT,
    @Title          NVARCHAR(300) = NULL,
    @Notes          NVARCHAR(MAX) = NULL,
    @AssigneeUserId INT = NULL,
    @DueDate        DATE = NULL,
    @StoryPoints    INT = NULL,
    @Color          VARCHAR(10) = NULL,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Title = NULLIF(LTRIM(RTRIM(@Title)), N'');
    IF @Title IS NOT NULL AND LEN(@Title) > 300
        THROW 50004, N'VALIDATION:A card title is up to 300 characters', 1;
    IF @StoryPoints IS NOT NULL AND @StoryPoints NOT BETWEEN 0 AND 999
        THROW 50004, N'VALIDATION:Story points are a number from 0 to 999', 1;
    IF @Color IS NOT NULL AND @Color NOT IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray')
        THROW 50004, N'VALIDATION:That is not a colour on the palette', 1;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Card not found', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = BoardId FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'boards:update';

    DECLARE @RequirementId INT, @KeyDeliverableId INT, @Found BIT = 0;
    SELECT @RequirementId = RequirementId, @KeyDeliverableId = KeyDeliverableId, @Found = 1
    FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @Found = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardCard WHERE BoardCardId = @BoardCardId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Card not found', 1;
        THROW 50002, N'CONFLICT:The card was changed by someone else', 1;
    END;

    IF @Title IS NULL AND @RequirementId IS NULL AND @KeyDeliverableId IS NULL
        THROW 50004, N'VALIDATION:A card needs a title', 1;

    IF @AssigneeUserId IS NOT NULL
        EXEC dbo.usp_BoardCard_AssertAssignee @BoardId = @BoardId, @AssigneeUserId = @AssigneeUserId;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT Title, AssigneeUserId, DueDate, StoryPoints, Color
         FROM app.BoardCard WHERE BoardCardId = @BoardCardId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.BoardCard SET
        Title = @Title,
        Notes = @Notes,
        AssigneeUserId = @AssigneeUserId,
        DueDate = @DueDate,
        StoryPoints = @StoryPoints,
        Color = @Color,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy = @ActorUserId
    WHERE BoardCardId = @BoardCardId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.BoardCard', CAST(@BoardCardId AS NVARCHAR(64)), @Before,
            (SELECT Title, AssigneeUserId, DueDate, StoryPoints, Color
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
