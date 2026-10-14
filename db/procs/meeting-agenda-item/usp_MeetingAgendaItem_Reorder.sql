-- usp_MeetingAgendaItem_Reorder — put a meeting's agenda in the order of @OrderJson (module #10,
-- ADR-0028): [{"id": <MeetingAgendaItemId>, "rowVer": <RowVer>}, ...], first = position 1.
-- The list must name every live agenda item of the meeting exactly once, each at the RowVer the
-- client read. The meeting row is locked (UPDLOCK, HOLDLOCK) and the check runs inside the
-- transaction, so a concurrent add, delete, edit or reorder makes this one fail (CONFLICT 50002)
-- instead of interleaving. An id of another meeting fails the same way and is never touched.
-- VALIDATION 50004: not a JSON array, an entry without a numeric id and rowVer, a repeated id, or
--   more than 500 entries.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- Returns ProjectId and MeetingId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_Reorder
    @MeetingId   INT,
    @OrderJson   NVARCHAR(MAX),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

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

    DECLARE @Locked INT;
    SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)
    WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    IF (SELECT COUNT(*) FROM app.MeetingAgendaItem WHERE MeetingId = @MeetingId AND IsDeleted = 0)
           <> (SELECT COUNT(*) FROM @Order)
       OR EXISTS (SELECT 1 FROM @Order AS o
                  WHERE NOT EXISTS (SELECT 1 FROM app.MeetingAgendaItem AS a
                                    WHERE a.MeetingAgendaItemId = o.Id AND a.MeetingId = @MeetingId
                                      AND a.IsDeleted = 0 AND CAST(a.RowVer AS BIGINT) = o.RowVer))
        THROW 50002, N'CONFLICT:The agenda was changed by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingAgendaItemId AS id, SortOrder
         FROM app.MeetingAgendaItem WHERE MeetingId = @MeetingId AND IsDeleted = 0
         ORDER BY SortOrder, MeetingAgendaItemId
         FOR JSON PATH);

    UPDATE a SET
        SortOrder    = o.Position,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.MeetingAgendaItem AS a
    JOIN @Order AS o ON o.Id = a.MeetingAgendaItemId
    WHERE a.MeetingId = @MeetingId AND a.IsDeleted = 0 AND a.SortOrder <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'ReorderAgenda', N'app.Meeting', CAST(@MeetingId AS NVARCHAR(64)), @Before,
            (SELECT MeetingAgendaItemId AS id, SortOrder
             FROM app.MeetingAgendaItem WHERE MeetingId = @MeetingId AND IsDeleted = 0
             ORDER BY SortOrder, MeetingAgendaItemId
             FOR JSON PATH));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
