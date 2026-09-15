-- usp_Meeting_GetAttendees — port of Access qryMeetingAttendees:
-- participants of a meeting who attended (IsApology = 0), with display name.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetAttendees
    @MeetingId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    SELECT mp.MeetingParticipantId,
           mp.MeetingId,
           mp.StakeholderId,
           LTRIM(RTRIM(CONCAT(s.[FirstName], N' ', ISNULL(s.[LastName], N'')))) AS ParticipantName,
           CAST(mp.RowVer AS BIGINT) AS RowVer
    FROM app.MeetingParticipant AS mp
    JOIN app.Stakeholder AS s
        ON s.StakeholderId = mp.StakeholderId
    WHERE mp.IsDeleted = 0
      AND mp.MeetingId = @MeetingId
      AND mp.[IsApology] = 0
    ORDER BY s.[FirstName], s.[LastName];
END;
GO
