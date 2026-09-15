-- usp_MeetingDiscussionPoint_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.MeetingDiscussionPoint (source: tblMeetingDiscussionPoints). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_Update
    @MeetingDiscussionPointId INT,
    @AgendaItemId INT,
    @DiscussionPoint NVARCHAR(MAX) = NULL,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:MeetingDiscussionPoint was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingDiscussionPointId, [AgendaItemId], [DiscussionPoint]
         FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingDiscussionPoint SET
        [AgendaItemId] = @AgendaItemId,
        [DiscussionPoint] = @DiscussionPoint,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingDiscussionPoint', CAST(@MeetingDiscussionPointId AS NVARCHAR(64)), @Before,
            (SELECT MeetingDiscussionPointId, [AgendaItemId], [DiscussionPoint]
             FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingDiscussionPointId,
           [AgendaItemId],
           [DiscussionPoint],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.MeetingDiscussionPoint
    WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId;
END;
GO
