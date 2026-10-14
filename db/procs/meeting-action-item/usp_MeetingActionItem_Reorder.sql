-- usp_MeetingActionItem_Reorder — put a set of sibling actions in the order of @OrderJson (module
-- #10, ADR-0028): [{"id": <MeetingActionItemId>, "rowVer": <RowVer>}, ...], first = position 1.
-- Siblings: the actions of @DiscussionPointId, or the actions directly under @AgendaItemId (no
--   discussion point). Exactly one parent (VALIDATION 50004 otherwise).
-- The rules are usp_MeetingAgendaItem_Reorder's: every live sibling exactly once at the RowVer the
-- client read, checked inside the transaction with the meeting row locked (CONFLICT 50002 otherwise;
-- ids of other parents are never touched).
-- VALIDATION 50004: not a JSON array, an entry without a numeric id and rowVer, a repeated id, or
--   more than 500 entries.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- Returns ProjectId and MeetingId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_Reorder
    @DiscussionPointId INT = NULL,
    @AgendaItemId      INT = NULL,
    @OrderJson         NVARCHAR(MAX),
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF (@DiscussionPointId IS NULL AND @AgendaItemId IS NULL)
       OR (@DiscussionPointId IS NOT NULL AND @AgendaItemId IS NOT NULL)
        THROW 50004, N'VALIDATION:Give either DiscussionPointId or AgendaItemId', 1;

    DECLARE @RowProjectId INT, @MeetingId INT;
    IF @DiscussionPointId IS NOT NULL
    BEGIN
        SELECT @MeetingId = a.MeetingId, @RowProjectId = m.ProjectId
        FROM app.MeetingDiscussionPoint AS dp
        JOIN app.MeetingAgendaItem AS a ON a.MeetingAgendaItemId = dp.AgendaItemId AND a.IsDeleted = 0
        LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
        WHERE dp.MeetingDiscussionPointId = @DiscussionPointId AND dp.IsDeleted = 0
          AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
        IF @@ROWCOUNT = 0
            THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;
    END
    ELSE
    BEGIN
        SELECT @MeetingId = a.MeetingId, @RowProjectId = m.ProjectId
        FROM app.MeetingAgendaItem AS a
        LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
        WHERE a.MeetingAgendaItemId = @AgendaItemId AND a.IsDeleted = 0
          AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
        IF @@ROWCOUNT = 0
            THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;
    END;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF ISJSON(@OrderJson) = 0 OR LEFT(TRIM(@OrderJson), 1) <> N'['
        THROW 50004, N'VALIDATION:OrderJson must be a JSON array', 1;

    DECLARE @Order TABLE (Position INT NOT NULL, Id INT NULL, RowVer BIGINT NULL);
    INSERT INTO @Order (Position, Id, RowVer)
    SELECT CAST(j.[key] AS INT) + 1, TRY_CAST(v.Id AS INT), TRY_CAST(v.RowVer AS BIGINT)
    FROM OPENJSON(@OrderJson) AS j
    OUTER APPLY OPENJSON(CASE WHEN j.[type] = 5 THEN j.[value] END)
        WITH (Id NVARCHAR(30) N'$.id', RowVer NVARCHAR(30) N'$.rowVer') AS v;

    IF EXISTS (SELECT 1 FROM @Order WHERE Id IS NULL OR RowVer IS NULL)
       OR (SELECT COUNT(*) FROM @Order) > 500
       OR (SELECT COUNT(*) FROM @Order) <> (SELECT COUNT(DISTINCT Id) FROM @Order)
        THROW 50004, N'VALIDATION:OrderJson must list each item once as {id, rowVer}', 1;

    BEGIN TRAN;

    IF @MeetingId IS NOT NULL
    BEGIN
        DECLARE @Locked INT;
        SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)
        WHERE MeetingId = @MeetingId AND IsDeleted = 0;
        IF @Locked IS NULL
            THROW 50001, N'NOT_FOUND:Meeting not found', 1;
    END;

    DECLARE @Siblings TABLE (Id INT PRIMARY KEY, SortOrder INT NOT NULL, RowVer BIGINT NOT NULL);
    INSERT INTO @Siblings (Id, SortOrder, RowVer)
    SELECT MeetingActionItemId, SortOrder, CAST(RowVer AS BIGINT)
    FROM app.MeetingActionItem
    WHERE IsDeleted = 0
      AND ((@DiscussionPointId IS NOT NULL AND DiscussionPointId = @DiscussionPointId)
           OR (@DiscussionPointId IS NULL AND AgendaItemId = @AgendaItemId AND DiscussionPointId IS NULL));

    IF (SELECT COUNT(*) FROM @Siblings) <> (SELECT COUNT(*) FROM @Order)
       OR EXISTS (SELECT 1 FROM @Order AS o
                  WHERE NOT EXISTS (SELECT 1 FROM @Siblings AS s WHERE s.Id = o.Id AND s.RowVer = o.RowVer))
        THROW 50002, N'CONFLICT:The actions were changed by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT Id AS id, SortOrder FROM @Siblings ORDER BY SortOrder, Id FOR JSON PATH);

    UPDATE ai SET
        SortOrder    = o.Position,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.MeetingActionItem AS ai
    JOIN @Order AS o ON o.Id = ai.MeetingActionItemId
    JOIN @Siblings AS s ON s.Id = ai.MeetingActionItemId
    WHERE ai.SortOrder <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'ReorderActionItems',
            CASE WHEN @DiscussionPointId IS NOT NULL THEN N'app.MeetingDiscussionPoint' ELSE N'app.MeetingAgendaItem' END,
            CAST(COALESCE(@DiscussionPointId, @AgendaItemId) AS NVARCHAR(64)), @Before,
            (SELECT o.Id AS id, o.Position AS SortOrder FROM @Order AS o ORDER BY o.Position FOR JSON PATH));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
