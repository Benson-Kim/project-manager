-- usp_MeetingDiscussionPoint_GetById — fetch one active app.MeetingDiscussionPoint row; THROW 50001 when absent/soft-deleted.
-- Entity app.MeetingDiscussionPoint (source: tblMeetingDiscussionPoints). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_GetById
    @MeetingDiscussionPointId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;

    SELECT MeetingDiscussionPointId,
           [AgendaItemId],
           [DiscussionPoint],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.MeetingDiscussionPoint
    WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId AND IsDeleted = 0;
END;
GO
