-- usp_MeetingActionFollowUp_Reorder — put an action item's follow-ups in the order of @OrderJson
-- (module #10, ADR-0041): [{"id": <MeetingActionFollowUpId>, "rowVer": <RowVer>}, ...],
-- first = position 1.
-- The rules are usp_MeetingActionItem_Reorder's: every live sibling exactly once at the RowVer the
-- client read, checked inside the transaction with the meeting row and the live siblings locked
-- (UPDLOCK, HOLDLOCK; CONFLICT 50002 otherwise; follow-ups of other actions are never touched).
-- VALIDATION 50004: not a JSON array, an entry without a numeric id and rowVer, a repeated id, or
--   more than 500 entries.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- Returns ProjectId and MeetingId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionFollowUp_Reorder
    @MeetingActionItemId INT,
    @OrderJson           NVARCHAR(MAX),
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = ai.MeetingId
    FROM app.MeetingActionItem AS ai
    LEFT JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId
    WHERE ai.MeetingActionItemId = @MeetingActionItemId AND ai.IsDeleted = 0
      AND (ai.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

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
    SELECT MeetingActionFollowUpId, SortOrder, CAST(RowVer AS BIGINT)
    FROM app.MeetingActionFollowUp WITH (UPDLOCK, HOLDLOCK)
    WHERE IsDeleted = 0 AND MeetingActionItemId = @MeetingActionItemId;

    IF (SELECT COUNT(*) FROM @Siblings) <> (SELECT COUNT(*) FROM @Order)
       OR EXISTS (SELECT 1 FROM @Order AS o
                  WHERE NOT EXISTS (SELECT 1 FROM @Siblings AS s WHERE s.Id = o.Id AND s.RowVer = o.RowVer))
        THROW 50002, N'CONFLICT:The follow-ups were changed by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT Id AS id, SortOrder FROM @Siblings ORDER BY SortOrder, Id FOR JSON PATH);

    UPDATE fu SET
        SortOrder    = o.Position,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.MeetingActionFollowUp AS fu
    JOIN @Order AS o ON o.Id = fu.MeetingActionFollowUpId
    JOIN @Siblings AS s ON s.Id = fu.MeetingActionFollowUpId
    WHERE fu.SortOrder <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'ReorderActionFollowUps', N'app.MeetingActionItem',
            CAST(@MeetingActionItemId AS NVARCHAR(64)), @Before,
            (SELECT o.Id AS id, o.Position AS SortOrder FROM @Order AS o ORDER BY o.Position FOR JSON PATH));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
