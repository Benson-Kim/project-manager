-- usp_Meeting_Create — insert one app.Meeting row; audits in-transaction; returns the new row.
-- Entity app.Meeting (source: tblMeetingMinutes (recovered)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_Create
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
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    INSERT INTO app.Meeting ([ProjectId], [Subject], [Description], [Location], [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction], CreatedBy)
    VALUES (@ProjectId, @Subject, @Description, @Location, @StartDate, @StartTime, @EndTime, @Conclusion, @NextMeeting, @FollowupAction, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Meeting', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingId, [ProjectId], [Subject], [Description], [Location], [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction]
             FROM app.Meeting WHERE MeetingId = @Id
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
    WHERE MeetingId = @Id;
END;
GO
