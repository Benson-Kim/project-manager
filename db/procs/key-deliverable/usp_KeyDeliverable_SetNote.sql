-- usp_KeyDeliverable_SetNote — replace the note pinned to one work item (ADR-0052, the paperclip);
-- returns the item's ProjectId and new RowVer. Blank text clears it.
-- Its own intention, apart from usp_KeyDeliverable_Update, because the note autosaves while the
--   details form may be open: a note save never resends the item's other fields.
-- At most 8000 characters. The column is MAX so a later limit change needs no migration.
-- Access: Manager + key-deliverables:update, as every other item write. CONFLICT 50002 on a stale
--   RowVer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_SetNote
    @KeyDeliverableId INT,
    @Note             NVARCHAR(MAX),
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    SET @Note = NULLIF(RTRIM(@Note), N'');
    IF LEN(@Note) > 8000
        THROW 50004, N'VALIDATION:A note can be at most 8000 characters', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT Note FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.KeyDeliverable SET
        Note         = @Note,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)),
            @Before,
            (SELECT @Note AS Note FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @RowProjectId AS ProjectId,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId;
END;
GO
