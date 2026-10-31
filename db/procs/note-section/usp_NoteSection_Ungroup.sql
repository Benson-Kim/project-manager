-- usp_NoteSection_Ungroup — remove a note's tabs and keep every page (ADR-0053). @OrderJson names
-- every live tab once at the RowVer the caller saw ([{"id":..,"rowVer":..}]; CONFLICT 50002 when
-- one is missing, extra or stale). The pages are renumbered tab by tab, so the plain list reads in
-- the order the tabs showed; the tabs are soft-deleted. Under the note's row lock; audits
-- in-transaction. Nothing a page holds is lost, so this needs the update right, not delete.
-- Access: Contributor on the note's project, or a per-person grant (notes:update, ADR-0024).
-- VALIDATION 50004: not a JSON array of {id, rowVer}, a repeated id, or more than 500.
-- Entity app.NoteSection (tabs of pages). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteSection_Ungroup
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

    DECLARE @Order TABLE (Id INT NULL, RowVer BIGINT NULL);
    INSERT INTO @Order (Id, RowVer)
    SELECT TRY_CAST(v.Id AS INT), TRY_CAST(v.RowVer AS BIGINT)
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

    DECLARE @Live TABLE (Id INT PRIMARY KEY, RowVer BIGINT NOT NULL);
    INSERT INTO @Live (Id, RowVer)
    SELECT NoteSectionId, CAST(RowVer AS BIGINT)
    FROM app.NoteSection WITH (UPDLOCK, HOLDLOCK)
    WHERE NoteId = @NoteId AND IsDeleted = 0;

    IF (SELECT COUNT(*) FROM @Live) = 0
       OR (SELECT COUNT(*) FROM @Live) <> (SELECT COUNT(*) FROM @Order)
       OR EXISTS (SELECT 1 FROM @Order AS o
                  WHERE NOT EXISTS (SELECT 1 FROM @Live AS l WHERE l.Id = o.Id AND l.RowVer = o.RowVer))
        THROW 50002, N'CONFLICT:The tabs were changed by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT s.NoteSectionId, s.[Title], s.[SortOrder],
                (SELECT t.NoteTabId AS id, t.[SortOrder] FROM app.NoteTab AS t
                 WHERE t.NoteSectionId = s.NoteSectionId AND t.IsDeleted = 0
                 ORDER BY t.[SortOrder] FOR JSON PATH) AS Pages
         FROM app.NoteSection AS s
         WHERE s.NoteId = @NoteId AND s.IsDeleted = 0
         ORDER BY s.[SortOrder], s.NoteSectionId
         FOR JSON PATH);

    WITH Ordered AS (
        SELECT t.NoteTabId,
               ROW_NUMBER() OVER (ORDER BY s.[SortOrder], s.NoteSectionId, t.[SortOrder], t.NoteTabId) AS Position
        FROM app.NoteTab AS t
        JOIN app.NoteSection AS s ON s.NoteSectionId = t.NoteSectionId
        WHERE t.NoteId = @NoteId AND t.IsDeleted = 0
    )
    UPDATE t SET
        NoteSectionId = NULL,
        [SortOrder]   = o.Position,
        UpdatedAtUtc  = SYSUTCDATETIME(),
        UpdatedBy     = @ActorUserId
    FROM app.NoteTab AS t
    JOIN Ordered AS o ON o.NoteTabId = t.NoteTabId;

    UPDATE app.NoteSection SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE NoteId = @NoteId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'RemoveTabs', N'app.Note', CAST(@NoteId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
