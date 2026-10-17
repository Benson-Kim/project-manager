-- usp_Meeting_Create — insert one app.Meeting row; audits in-transaction; returns the new row
-- (module #10, ADR-0028). Every field but the project may be empty: "New meeting" creates a draft
-- that the workspace then fills in (checklist row 53).
-- Access: Contributor on @ProjectId, or a per-person grant (meetings:create, ADR-0024); the project
--   must be live (NOT_FOUND 50001).
-- VALIDATION 50004: @ProjectId missing; StartTime not before EndTime when both are set.
-- Description, Objective and Conclusion are rich text sanitised by the app (ADR-0025); stored as given.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_Create
    @ProjectId      INT,
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
    @FollowupAction NVARCHAR(255) = NULL,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:create', @AllowProjectless = 0;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;
    IF @StartTime IS NOT NULL AND @EndTime IS NOT NULL AND @EndTime <= @StartTime
        THROW 50004, N'VALIDATION:EndTime must be after StartTime', 1;

    BEGIN TRAN;

    INSERT INTO app.Meeting ([ProjectId], [Subject], [Objective], [DateReceived], [Description], [Location],
                             [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction],
                             CreatedBy)
    VALUES (@ProjectId, @Subject, @Objective, @DateReceived, @Description, @Location,
            @StartDate, @StartTime, @EndTime, @Conclusion, @NextMeeting, @FollowupAction,
            @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Meeting', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingId, [ProjectId], [Subject], [Objective], [DateReceived], [Description], [Location],
                    [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction]
             FROM app.Meeting WHERE MeetingId = @Id
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
    WHERE MeetingId = @Id;
END;
GO
