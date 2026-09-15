-- usp_Meeting_GetApologies — port of Access qryMeetingApologies:
-- participants of a meeting who sent apologies (IsApology = 1), with display name.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetApologies
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
      AND mp.[IsApology] = 1
    ORDER BY s.[FirstName], s.[LastName];
END;
GO
