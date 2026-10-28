-- usp_Board_GetBoard — everything one board view needs, in five result sets, read through
-- execProcSets (src/lib/db.ts). Shaped like dbo.usp_Financial_GetSheet, which returns seven the
-- same way. A read proc opens no transaction (LESSONS §30).
--   1. Header: the board, the actor's standing, the freshness stamp, the active sprint, the backlog
--      count.
--   2. Columns, with CardCount (every live card) and WipCount (the cards that count against the
--      limit — dbo.ufn_Board_CardsInScope).
--   3. Phases.
--   4. Sprints, with their card and story-point totals.
--   5. Cards, capped per list and redacted.
-- Row-level access: dbo.usp_Board_AssertAccess at Viewer. A read passes no @Permission, so an
--   override can never widen it.
-- STAMP, read before the rows (as dbo.usp_KeyDeliverable_GanttData does): the highest RowVer across
--   the board and all its children. Reading it first means a change that lands mid-read only causes
--   a needless refresh, never a stale view that looks fresh.
-- @View: 'board' shows the cards the board is working (dbo.ufn_Board_CardsInScope) in column lists;
--   'plan' shows every live card grouped by sprint, with the backlog as list 0. @SprintId narrows
--   the planning view to one sprint.
-- @CardsPerList is clamped to 1..200 here, not trusted from the caller: it sizes the rows this proc
--   returns, so an unclamped value is a way to ask for the whole board in one call.
-- REDACTION — a card may carry a requirement from a project the reader cannot see (a standalone
--   board may mix projects). Such a card reports RequirementState 'restricted' and NULL in every
--   requirement column, and @Search never matches its text: matching it would reveal that the text
--   exists, which is the same leak by another route. 'restricted' is decided BEFORE 'removed', so
--   a reader without access is never told that a requirement was deleted either.
-- @Search escapes the LIKE metacharacters (docs/STANDARDS.md 2.3).
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_GetBoard
    @BoardId      INT,
    @ActorUserId  INT,
    @View         VARCHAR(10) = 'board',
    @CardsPerList INT = 50,
    @Search       NVARCHAR(100) = NULL,
    @SprintId     INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF ISNULL(@View, '') NOT IN ('board', 'plan')
        THROW 50004, N'VALIDATION:A board is viewed as a board or a plan', 1;

    SET @CardsPerList = ISNULL(@CardsPerList, 50);
    IF @CardsPerList < 1 SET @CardsPerList = 1;
    IF @CardsPerList > 200 SET @CardsPerList = 200;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

    DECLARE @Stamp BIGINT = 0, @Next BIGINT;
    SELECT @Stamp = ISNULL(MAX(CAST(RowVer AS BIGINT)), 0) FROM app.Board WHERE BoardId = @BoardId;
    SELECT @Next = ISNULL(MAX(CAST(RowVer AS BIGINT)), 0) FROM app.BoardColumn WHERE BoardId = @BoardId;
    IF @Next > @Stamp SET @Stamp = @Next;
    SELECT @Next = ISNULL(MAX(CAST(RowVer AS BIGINT)), 0) FROM app.BoardPhase WHERE BoardId = @BoardId;
    IF @Next > @Stamp SET @Stamp = @Next;
    SELECT @Next = ISNULL(MAX(CAST(RowVer AS BIGINT)), 0) FROM app.BoardSprint WHERE BoardId = @BoardId;
    IF @Next > @Stamp SET @Stamp = @Next;
    SELECT @Next = ISNULL(MAX(CAST(RowVer AS BIGINT)), 0) FROM app.BoardCard WHERE BoardId = @BoardId;
    IF @Next > @Stamp SET @Stamp = @Next;

    DECLARE @ActiveSprintId INT =
        (SELECT TOP (1) BoardSprintId FROM app.BoardSprint
         WHERE BoardId = @BoardId AND [State] = 'active' AND IsDeleted = 0);

    -- 1. Header.
    SELECT b.BoardId,
           b.ProjectId,
           p.ProjectName,
           b.[Name],
           b.[Description],
           b.CreatedBy,
           b.CreatedAtUtc,
           b.UpdatedAtUtc,
           CAST(b.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           @Stamp AS Stamp,
           @ActiveSprintId AS ActiveSprintId,
           (SELECT COUNT(*) FROM app.BoardCard
            WHERE BoardId = @BoardId AND IsDeleted = 0 AND BoardSprintId IS NULL) AS BacklogCount
    FROM app.Board b
    CROSS APPLY dbo.ufn_Board_AccessLevel(@ActorRole, @ActorUserId, b.ProjectId, b.CreatedBy) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, b.ProjectId, N'boards') ov
    LEFT JOIN app.Project p ON p.ProjectId = b.ProjectId
    WHERE b.BoardId = @BoardId AND b.IsDeleted = 0;

    -- 2. Columns. WipCount is what the limit is measured against; CardCount is everything live in
    --    the column, so the planning view can show work the board view is not currently counting.
    SELECT col.BoardColumnId,
           col.BoardId,
           col.[Name],
           col.Category,
           col.WipLimit,
           col.SortOrder,
           CAST(col.RowVer AS BIGINT) AS RowVer,
           (SELECT COUNT(*) FROM app.BoardCard c
            WHERE c.BoardId = @BoardId AND c.IsDeleted = 0
              AND c.BoardColumnId = col.BoardColumnId) AS CardCount,
           (SELECT COUNT(*) FROM dbo.ufn_Board_CardsInScope(@BoardId) s
            WHERE s.BoardColumnId = col.BoardColumnId) AS WipCount
    FROM app.BoardColumn col
    WHERE col.BoardId = @BoardId AND col.IsDeleted = 0
    ORDER BY col.SortOrder ASC, col.BoardColumnId ASC;

    -- 3. Phases.
    SELECT ph.BoardPhaseId,
           ph.BoardId,
           ph.[Name],
           ph.StartDate,
           ph.EndDate,
           ph.SortOrder,
           CAST(ph.RowVer AS BIGINT) AS RowVer
    FROM app.BoardPhase ph
    WHERE ph.BoardId = @BoardId AND ph.IsDeleted = 0
    ORDER BY ph.SortOrder ASC, ph.BoardPhaseId ASC;

    -- 4. Sprints.
    SELECT sp.BoardSprintId,
           sp.BoardId,
           sp.BoardPhaseId,
           sp.[Name],
           sp.Goal,
           sp.StartDate,
           sp.EndDate,
           sp.[State],
           sp.StartedAtUtc,
           sp.CompletedAtUtc,
           CAST(sp.RowVer AS BIGINT) AS RowVer,
           (SELECT COUNT(*) FROM app.BoardCard c
            WHERE c.BoardId = @BoardId AND c.IsDeleted = 0
              AND c.BoardSprintId = sp.BoardSprintId) AS CardCount,
           (SELECT ISNULL(SUM(c.StoryPoints), 0) FROM app.BoardCard c
            WHERE c.BoardId = @BoardId AND c.IsDeleted = 0
              AND c.BoardSprintId = sp.BoardSprintId) AS PointTotal
    FROM app.BoardSprint sp
    WHERE sp.BoardId = @BoardId AND sp.IsDeleted = 0
    ORDER BY sp.StartDate ASC, sp.BoardSprintId ASC;

    -- 5. Cards, capped per list so one crowded column cannot return the whole board.
    WITH scoped AS (
        SELECT c.BoardCardId,
               c.BoardId,
               c.BoardColumnId,
               c.BoardSprintId,
               c.Title,
               c.AssigneeUserId,
               c.DueDate,
               c.StoryPoints,
               c.Color,
               c.SortKey,
               c.RowVer,
               c.RequirementId,
               rq.RequirementId AS FoundRequirementId,
               rq.IsDeleted AS RequirementIsDeleted,
               rq.RequirementType,
               rq.Number AS RequirementNumber,
               rp.Ref AS RequirementRef,
               rq.Requirement AS RequirementText,
               rq.IsMet AS RequirementIsMet,
               rq.ProjectId AS RequirementProjectId,
               ra.AccessLevel AS RequirementAccess,
               CASE WHEN @View = 'plan' THEN ISNULL(c.BoardSprintId, 0) ELSE c.BoardColumnId END AS ListKey
        FROM app.BoardCard c
        LEFT JOIN app.Requirement rq ON rq.RequirementId = c.RequirementId
        OUTER APPLY dbo.ufn_Requirement_AncestorPath(rq.RequirementId) rp
        OUTER APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, rq.ProjectId, 0) ra
        WHERE c.BoardId = @BoardId
          AND c.IsDeleted = 0
          AND (@View = 'plan'
               OR EXISTS (SELECT 1 FROM dbo.ufn_Board_CardsInScope(@BoardId) s
                          WHERE s.BoardCardId = c.BoardCardId))
          AND (@SprintId IS NULL OR c.BoardSprintId = @SprintId)
          AND (@Search IS NULL
               OR c.Title LIKE N'%' + @Search + N'%' ESCAPE N'\'
               OR (rq.RequirementId IS NOT NULL AND rq.IsDeleted = 0 AND ra.AccessLevel IS NOT NULL
                   AND rq.Requirement LIKE N'%' + @Search + N'%' ESCAPE N'\'))
    ),
    ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY ListKey ORDER BY SortKey ASC, BoardCardId ASC) AS RowInList
        FROM scoped
    )
    SELECT BoardCardId,
           BoardId,
           BoardColumnId,
           BoardSprintId,
           Title,
           AssigneeUserId,
           DueDate,
           StoryPoints,
           Color,
           SortKey,
           CAST(RowVer AS BIGINT) AS RowVer,
           -- 'restricted' is tested before 'removed': a reader who cannot see the requirement's
           -- project is not told whether it still exists.
           CASE WHEN RequirementId IS NULL THEN 'none'
                WHEN RequirementAccess IS NULL THEN 'restricted'
                WHEN FoundRequirementId IS NULL OR RequirementIsDeleted = 1 THEN 'removed'
                ELSE 'live'
           END AS RequirementState,
           CASE WHEN RequirementAccess IS NOT NULL AND RequirementIsDeleted = 0
                THEN RequirementId END AS RequirementId,
           CASE WHEN RequirementAccess IS NOT NULL AND RequirementIsDeleted = 0
                THEN RequirementType END AS RequirementType,
           CASE WHEN RequirementAccess IS NOT NULL AND RequirementIsDeleted = 0
                THEN RequirementNumber END AS RequirementNumber,
           CASE WHEN RequirementAccess IS NOT NULL AND RequirementIsDeleted = 0 THEN RequirementRef END AS RequirementRef,
           CASE WHEN RequirementAccess IS NOT NULL AND RequirementIsDeleted = 0
                THEN RequirementText END AS RequirementText,
           CASE WHEN RequirementAccess IS NOT NULL AND RequirementIsDeleted = 0
                THEN RequirementIsMet END AS RequirementIsMet,
           CASE WHEN RequirementAccess IS NOT NULL AND RequirementIsDeleted = 0
                THEN RequirementProjectId END AS RequirementProjectId
    FROM ranked
    WHERE RowInList <= @CardsPerList
    ORDER BY ListKey ASC, SortKey ASC, BoardCardId ASC;
END;
GO
