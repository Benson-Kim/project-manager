-- usp_MeetingParticipant_GetById — fetch one active app.MeetingParticipant row; THROW 50001 when absent/soft-deleted.
-- Entity app.MeetingParticipant (source: tblMeetingParticipants). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_GetById
    @MeetingParticipantId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.MeetingParticipant WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:MeetingParticipant not found', 1;

    SELECT MeetingParticipantId,
           [MeetingId],
           [StakeholderId],
           [IsApology],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.MeetingParticipant
    WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0;
END;
GO
