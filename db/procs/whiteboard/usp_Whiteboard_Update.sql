-- usp_Whiteboard_Update — save a whiteboard's drawing, whole (migration 086).
-- Access: Contributor + whiteboard:update. The project comes from the row. A stale @RowVer answers
--   409, so a second editor never overwrites the first. The app validates the scene's shape; this
--   proc refuses anything that is not version 1 JSON of at most 800,000 characters with an elements
--   list. The audit row keeps the element count, not the drawing, so a save does not copy the scene
--   into the log. Answers with the new RowVer and the row's ProjectId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Whiteboard_Update
    @WhiteboardId INT,
    @BoardJson    NVARCHAR(MAX),
    @RowVer       BIGINT,
    @ActorUserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentVer BIGINT, @OldJson NVARCHAR(MAX);
    SELECT @RowProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @OldJson = BoardJson
    FROM app.Whiteboard
    WHERE WhiteboardId = @WhiteboardId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Whiteboard not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'whiteboard:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Whiteboard was modified by someone else', 1;

    IF @BoardJson IS NULL OR LEN(@BoardJson) > 800000
        THROW 50004, N'VALIDATION:The whiteboard is too large to save', 1;
    IF ISJSON(@BoardJson) <> 1
        THROW 50004, N'VALIDATION:The whiteboard could not be read', 1;
    IF ISNULL(JSON_VALUE(@BoardJson, N'$.version'), N'') <> N'1'
       OR LEFT(LTRIM(ISNULL(JSON_QUERY(@BoardJson, N'$.elements'), N'')), 1) <> N'['
        THROW 50004, N'VALIDATION:The whiteboard could not be read', 1;

    BEGIN TRAN;

    UPDATE app.Whiteboard SET
        BoardJson    = @BoardJson,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE WhiteboardId = @WhiteboardId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Whiteboard was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Whiteboard', CAST(@WhiteboardId AS NVARCHAR(64)),
            (SELECT (SELECT COUNT(*) FROM OPENJSON(@OldJson, N'$.elements')) AS elements
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT (SELECT COUNT(*) FROM OPENJSON(@BoardJson, N'$.elements')) AS elements
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT WhiteboardId, ProjectId, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Whiteboard
    WHERE WhiteboardId = @WhiteboardId;
END;
GO
