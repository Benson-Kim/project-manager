-- usp_Meeting_Delete — soft delete with rowversion concurrency (checked in the transaction); the
-- meeting's agenda items, discussion points, action items and participants are soft-deleted in the
-- same transaction (module #10, ADR-0028). One audit row lists what the cascade removed.
-- Access: Manager on the meeting's project, or a per-person grant (meetings:delete, ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_Delete
    @MeetingId   INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'meetings:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingId, [ProjectId], [Subject], [Objective], [DateReceived], [Description], [Location],
                [StartDate], [StartTime], [EndTime], [Conclusion], [NextMeeting], [FollowupAction]
         FROM app.Meeting WHERE MeetingId = @MeetingId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    UPDATE app.Meeting SET
        IsDeleted    = 1,
        DeletedAtUtc = @Now,
        DeletedBy    = @ActorUserId
    WHERE MeetingId = @MeetingId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Meeting not found', 1;
        THROW 50002, N'CONFLICT:Meeting was modified by someone else', 1;
    END

    DECLARE @Agenda TABLE (Id INT PRIMARY KEY);
    INSERT INTO @Agenda (Id)
    SELECT MeetingAgendaItemId FROM app.MeetingAgendaItem WHERE MeetingId = @MeetingId;

    DECLARE @Points TABLE (Id INT PRIMARY KEY);
    INSERT INTO @Points (Id)
    SELECT MeetingDiscussionPointId FROM app.MeetingDiscussionPoint
    WHERE AgendaItemId IN (SELECT Id FROM @Agenda);

    DECLARE @Removed TABLE (Kind VARCHAR(20), Id INT);

    UPDATE app.MeetingActionItem SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    OUTPUT 'ActionItems', inserted.MeetingActionItemId INTO @Removed (Kind, Id)
    WHERE IsDeleted = 0
      AND (MeetingId = @MeetingId
           OR AgendaItemId IN (SELECT Id FROM @Agenda)
           OR DiscussionPointId IN (SELECT Id FROM @Points));

    UPDATE app.MeetingDiscussionPoint SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    OUTPUT 'DiscussionPoints', inserted.MeetingDiscussionPointId INTO @Removed (Kind, Id)
    WHERE IsDeleted = 0 AND MeetingDiscussionPointId IN (SELECT Id FROM @Points);

    UPDATE app.MeetingAgendaItem SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    OUTPUT 'AgendaItems', inserted.MeetingAgendaItemId INTO @Removed (Kind, Id)
    WHERE IsDeleted = 0 AND MeetingAgendaItemId IN (SELECT Id FROM @Agenda);

    UPDATE app.MeetingParticipant SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    OUTPUT 'Participants', inserted.MeetingParticipantId INTO @Removed (Kind, Id)
    WHERE IsDeleted = 0 AND MeetingId = @MeetingId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.Meeting', CAST(@MeetingId AS NVARCHAR(64)), @Before,
            (SELECT m.MeetingId, m.IsDeleted, m.DeletedAtUtc, m.DeletedBy,
                    JSON_QUERY((SELECT Id FROM @Removed WHERE Kind = 'AgendaItems' FOR JSON PATH)) AS AgendaItems,
                    JSON_QUERY((SELECT Id FROM @Removed WHERE Kind = 'DiscussionPoints' FOR JSON PATH)) AS DiscussionPoints,
                    JSON_QUERY((SELECT Id FROM @Removed WHERE Kind = 'ActionItems' FOR JSON PATH)) AS ActionItems,
                    JSON_QUERY((SELECT Id FROM @Removed WHERE Kind = 'Participants' FOR JSON PATH)) AS Participants
             FROM app.Meeting AS m WHERE m.MeetingId = @MeetingId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;
END;
GO
