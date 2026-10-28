-- usp_Meeting_Update — full-row update of the meeting header with rowversion concurrency (50002
-- CONFLICT, checked in the transaction) and an in-transaction audit row (module #10, ADR-0028).
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- The project is immutable: @ProjectId is accepted but ignored.
-- VALIDATION 50004: StartTime not before EndTime when both are set and either changed (Access left
--   00:00-00:00 pairs, which must stay saveable).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_Update
    @MeetingId      INT,
    @ProjectId      INT           = NULL,
    @Subject        NVARCHAR(255) = NULL,
    @Objective      NVARCHAR(MAX) = NULL,
    @DateReceived   DATE          = NULL,
    @Description    NVARCHAR(MAX) = NULL,
    @Location       NVARCHAR(255) = NULL,
    @StartDate      DATETIME2     = NULL,
    @StartTime      TIME(0)       = NULL,
    @EndTime        TIME(0)       = NULL,
    @Conclusion     NVARCHAR(MAX) = NULL,
    @NextMeeting    DATETIME2     = NULL,
    @RowVer         BIGINT,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentStart TIME(0), @CurrentEnd TIME(0);
    SELECT @RowProjectId = ProjectId, @CurrentStart = StartTime, @CurrentEnd = EndTime
    FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF @StartTime IS NOT NULL AND @EndTime IS NOT NULL AND @EndTime <= @StartTime
       AND NOT (@StartTime = @CurrentStart AND @EndTime = @CurrentEnd)
        THROW 50004, N'VALIDATION:EndTime must be after StartTime', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingId, [ProjectId], [Subject], [Objective], [DateReceived], [Description], [Location],
                [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction]
         FROM app.Meeting WHERE MeetingId = @MeetingId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Meeting SET
        [Subject]        = @Subject,
        [Objective]      = @Objective,
        [DateReceived]   = @DateReceived,
        [Description]    = @Description,
        [Location]       = @Location,
        [StartDate]      = @StartDate,
        [StartTime]      = @StartTime,
        [EndTime]        = @EndTime,
        [Conclusion]     = @Conclusion,
        [NextMeeting]    = @NextMeeting,
        UpdatedAtUtc     = SYSUTCDATETIME(),
        UpdatedBy        = @ActorUserId
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
            (SELECT MeetingId, [ProjectId], [Subject], [Objective], [DateReceived], [Description], [Location],
                    [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction]
             FROM app.Meeting WHERE MeetingId = @MeetingId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingId,
           [ProjectId],
           [Subject],
           [Objective],
           [DateReceived],
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
