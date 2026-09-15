-- usp_MeetingAgendaItem_GetById — fetch one active app.MeetingAgendaItem row; THROW 50001 when absent/soft-deleted.
-- Entity app.MeetingAgendaItem (source: tblMeetingAgenda). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_GetById
    @MeetingAgendaItemId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.MeetingAgendaItem WHERE MeetingAgendaItemId = @MeetingAgendaItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;

    SELECT MeetingAgendaItemId,
           [MeetingId],
           [AgendaItem],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.MeetingAgendaItem
    WHERE MeetingAgendaItemId = @MeetingAgendaItemId AND IsDeleted = 0;
END;
GO
