-- usp_Meeting_GetById — fetch one active app.Meeting row; THROW 50001 when absent/soft-deleted.
-- Entity app.Meeting (source: tblMeetingMinutes (recovered)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetById
    @MeetingId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

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
    WHERE MeetingId = @MeetingId AND IsDeleted = 0;
END;
GO
