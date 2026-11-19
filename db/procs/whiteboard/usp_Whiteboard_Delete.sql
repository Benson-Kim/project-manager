-- usp_Whiteboard_Delete — soft-delete one whiteboard (migration 086).
-- Access: Manager + whiteboard:delete. The project comes from the row. A stale @RowVer answers 409, so a
--   delete never discards a save the deleter has not seen.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Whiteboard_Delete
    @WhiteboardId INT,
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
         @MinLevel = N'Manager', @Permission = N'whiteboard:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Whiteboard was modified by someone else', 1;

    BEGIN TRAN;

    UPDATE app.Whiteboard SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE WhiteboardId = @WhiteboardId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Whiteboard was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Whiteboard', CAST(@WhiteboardId AS NVARCHAR(64)),
            (SELECT @OldName AS name FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
