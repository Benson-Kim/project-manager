-- usp_Meeting_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.Meeting (source: tblMeetingMinutes (recovered)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_Update
    @MeetingId INT,
    @ProjectId INT = NULL,
    @Subject NVARCHAR(255) = NULL,
    @Description NVARCHAR(MAX) = NULL,
    @Location NVARCHAR(255) = NULL,
    @StartDate DATETIME2 = NULL,
    @StartTime TIME(0) = NULL,
    @EndTime TIME(0) = NULL,
    @Conclusion NVARCHAR(MAX) = NULL,
    @NextMeeting DATETIME2 = NULL,
    @FollowupAction NVARCHAR(255) = NULL,
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
        [ProjectId] = @ProjectId,
        [Subject] = @Subject,
        [Description] = @Description,
        [Location] = @Location,
        [StartDate] = @StartDate,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [Conclusion] = @Conclusion,
        [NextMeeting] = @NextMeeting,
        [FollowupAction] = @FollowupAction,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE MeetingId = @MeetingId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Meeting not found', 1;
        THROW 50002, N'CONFLICT:Meeting was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Meeting', CAST(@MeetingId AS NVARCHAR(64)), @Before,
            (SELECT MeetingId, [ProjectId], [Subject], [Description], [Location], [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction]
             FROM app.Meeting WHERE MeetingId = @MeetingId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingId,
           [ProjectId],
           [Subject],
           [Description],
           [Location],
           [StartDate],
           [StartTime],
           [EndTime],
           [Conclusion],
           [NextMeeting],
           [FollowupAction],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Meeting
    WHERE MeetingId = @MeetingId;
END;
GO
