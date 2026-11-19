-- usp_Whiteboard_Rename — rename a whiteboard (migration 086).
-- Access: Contributor + whiteboard:update. The project comes from the row. A stale @RowVer answers 409.
--   Answers with the same columns as usp_Whiteboard_List, plus ProjectId.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Whiteboard_Rename
    @WhiteboardId INT,
    @Name          NVARCHAR(200),
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentVer BIGINT, @OldName NVARCHAR(120);
    SELECT @RowProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT), @OldName = Name
    FROM app.Whiteboard
    WHERE WhiteboardId = @WhiteboardId AND IsDeleted = 0;
    IF @RowProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Whiteboard not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'whiteboard:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Whiteboard was modified by someone else', 1;

    SET @Name = TRIM(@Name);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    EXEC dbo.usp_Whiteboard_AssertName
         @ProjectId = @RowProjectId, @WhiteboardId = @WhiteboardId, @Name = @Name;

    UPDATE app.Whiteboard SET
        Name         = @Name,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE WhiteboardId = @WhiteboardId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Whiteboard was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Whiteboard', CAST(@WhiteboardId AS NVARCHAR(64)),
            (SELECT @OldName AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Name AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT WhiteboardId, ProjectId, Name, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Whiteboard
    WHERE WhiteboardId = @WhiteboardId;
END;
GO
