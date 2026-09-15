-- usp_MeetingParticipant_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.MeetingParticipant (source: tblMeetingParticipants). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_Delete
    @MeetingParticipantId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.MeetingParticipant WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:MeetingParticipant not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:MeetingParticipant was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingParticipantId, [MeetingId], [StakeholderId], [IsApology]
         FROM app.MeetingParticipant WHERE MeetingParticipantId = @MeetingParticipantId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingParticipant SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.MeetingParticipant', CAST(@MeetingParticipantId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
