-- usp_MeetingMinutesSection_Delete — soft-deletes one minutes section row (087) under rowversion concurrency
--   (50002): a box the user added goes, and a built-in section's row goes so its default title comes back.
-- Access: Manager on the meeting's project, or a per-person grant (meetings:delete).
-- Returns MeetingId for the workspace re-read.
USE ProjectManager;
GO

CREATE OR ALTER PROCEDURE dbo.usp_MeetingMinutesSection_Delete
    @MeetingMinutesSectionId INT,
    @RowVer                  BIGINT,
    @ActorUserId             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @MeetingId INT;
    SELECT @ProjectId = m.ProjectId, @MeetingId = m.MeetingId
    FROM app.MeetingMinutesSection AS s
    JOIN app.Meeting AS m ON m.MeetingId = s.MeetingId AND m.IsDeleted = 0
    WHERE s.MeetingMinutesSectionId = @MeetingMinutesSectionId AND s.IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:MeetingMinutesSection not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'meetings:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    UPDATE app.MeetingMinutesSection SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE MeetingMinutesSectionId = @MeetingMinutesSectionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:MeetingMinutesSection was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.MeetingMinutesSection',
            CAST(@MeetingMinutesSectionId AS NVARCHAR(64)),
            (SELECT MeetingMinutesSectionId, MeetingId, SectionKey, Title, SortOrder
             FROM app.MeetingMinutesSection WHERE MeetingMinutesSectionId = @MeetingMinutesSectionId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @ProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
