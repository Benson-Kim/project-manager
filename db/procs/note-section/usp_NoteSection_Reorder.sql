-- usp_NoteSection_Reorder — set the order of a note's tabs (ADR-0053). @OrderJson is
-- [{"id":..,"rowVer":..}, ...] naming every live tab once, at the RowVer the caller saw; a
-- missing, extra or stale tab is CONFLICT 50002, so two people reordering never interleave.
-- Under the note's row lock; audits in-transaction; returns the tabs in their new order. A tab
-- holds at least one page, so a note has at most 500 tabs. Pages keep their own SortOrder.
-- Access: Contributor on the note's project, or a per-person grant (notes:update, ADR-0024).
-- VALIDATION 50004: not a JSON array of {id, rowVer}, a repeated id, or more than 500.
-- Entity app.NoteSection (tabs of pages). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteSection_Reorder
    @NoteId      INT,
    @OrderJson   NVARCHAR(MAX),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Note WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'notes:update', @AllowProjectless = 1;

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
        THROW 50004, N'VALIDATION:OrderJson must list each tab once as {id, rowVer}', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = NoteId FROM app.Note WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Note not found', 1;

    DECLARE @Siblings TABLE (Id INT PRIMARY KEY, SortOrder INT NOT NULL, RowVer BIGINT NOT NULL);
    INSERT INTO @Siblings (Id, SortOrder, RowVer)
    SELECT NoteSectionId, [SortOrder], CAST(RowVer AS BIGINT)
    FROM app.NoteSection WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;

    IF (SELECT COUNT(*) FROM @Siblings) <> (SELECT COUNT(*) FROM @Order)
       OR EXISTS (SELECT 1 FROM @Order AS o
                  WHERE NOT EXISTS (SELECT 1 FROM @Siblings AS s WHERE s.Id = o.Id AND s.RowVer = o.RowVer))
        THROW 50002, N'CONFLICT:The tabs were changed by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT Id AS id, SortOrder FROM @Siblings ORDER BY SortOrder, Id FOR JSON PATH);

    UPDATE s SET
        [SortOrder]  = o.Position,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    FROM app.NoteSection AS s
    JOIN @Order AS o ON o.Id = s.NoteSectionId
    WHERE s.[SortOrder] <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'ReorderTabs', N'app.Note', CAST(@NoteId AS NVARCHAR(64)), @Before,
            (SELECT o.Id AS id, o.Position AS SortOrder FROM @Order AS o ORDER BY o.Position FOR JSON PATH));

    COMMIT;

    SELECT NoteSectionId,
           [NoteId],
           @RowProjectId AS ProjectId,
           [Title],
           [SortOrder],
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.NoteSection
    WHERE NoteId = @NoteId AND IsDeleted = 0
    ORDER BY [SortOrder], NoteSectionId;
END;
GO
