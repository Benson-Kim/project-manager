-- usp_MeetingAgendaItem_Create — insert one app.MeetingAgendaItem row; audits in-transaction; returns the new row.
-- Entity app.MeetingAgendaItem (source: tblMeetingAgenda). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_Create
    @MeetingId INT = NULL,
    @AgendaItem NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    INSERT INTO app.MeetingAgendaItem ([MeetingId], [AgendaItem], CreatedBy)
    VALUES (@MeetingId, @AgendaItem, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingAgendaItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingAgendaItemId, [MeetingId], [AgendaItem]
             FROM app.MeetingAgendaItem WHERE MeetingAgendaItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingAgendaItemId,
           [MeetingId],
           [AgendaItem],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.MeetingAgendaItem
    WHERE MeetingAgendaItemId = @Id;
END;
GO
