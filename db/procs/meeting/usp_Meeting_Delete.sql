-- usp_Meeting_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.Meeting (source: tblMeetingMinutes (recovered)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_Delete
    @MeetingId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Meeting was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingId, [ProjectId], [Subject], [Description], [Location], [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction]
         FROM app.Meeting WHERE MeetingId = @MeetingId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Meeting SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE MeetingId = @MeetingId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Meeting', CAST(@MeetingId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
