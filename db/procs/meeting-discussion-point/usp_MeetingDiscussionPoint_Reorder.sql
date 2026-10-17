-- usp_MeetingDiscussionPoint_Reorder — put an agenda item's discussion points in the order of
-- @OrderJson (module #10, ADR-0028): [{"id": <MeetingDiscussionPointId>, "rowVer": <RowVer>}, ...],
-- first = position 1. The rules are usp_MeetingAgendaItem_Reorder's: every live point of the agenda
-- item exactly once at the RowVer the client read, checked inside the transaction with the meeting
-- row and the live points locked (UPDLOCK, HOLDLOCK; CONFLICT 50002 otherwise; ids of other agenda
-- items are never touched).
-- VALIDATION 50004: not a JSON array, an entry without a numeric id and rowVer, a repeated id, or
--   more than 500 entries.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- Returns ProjectId and MeetingId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_Reorder
    @AgendaItemId INT,
    @OrderJson    NVARCHAR(MAX),
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = a.MeetingId
    FROM app.MeetingAgendaItem AS a
    LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
    WHERE a.MeetingAgendaItemId = @AgendaItemId AND a.IsDeleted = 0
      AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;

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
    SELECT MeetingDiscussionPointId, SortOrder, CAST(RowVer AS BIGINT)
    FROM app.MeetingDiscussionPoint WITH (UPDLOCK, HOLDLOCK)
    WHERE AgendaItemId = @AgendaItemId AND IsDeleted = 0;

    IF (SELECT COUNT(*) FROM @Siblings) <> (SELECT COUNT(*) FROM @Order)
       OR EXISTS (SELECT 1 FROM @Order AS o
                  WHERE NOT EXISTS (SELECT 1 FROM @Siblings AS s WHERE s.Id = o.Id AND s.RowVer = o.RowVer))
        THROW 50002, N'CONFLICT:The discussion points were changed by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT Id AS id, SortOrder FROM @Siblings ORDER BY SortOrder, Id FOR JSON PATH);

    UPDATE dp SET
        SortOrder    = o.Position,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.MeetingDiscussionPoint AS dp
    JOIN @Order AS o ON o.Id = dp.MeetingDiscussionPointId
    JOIN @Siblings AS s ON s.Id = dp.MeetingDiscussionPointId
    WHERE dp.SortOrder <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'ReorderDiscussionPoints', N'app.MeetingAgendaItem', CAST(@AgendaItemId AS NVARCHAR(64)), @Before,
            (SELECT o.Id AS id, o.Position AS SortOrder FROM @Order AS o ORDER BY o.Position FOR JSON PATH));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
