-- usp_MeetingDiscussionPoint_Create — insert one app.MeetingDiscussionPoint row; audits in-transaction; returns the new row.
-- Entity app.MeetingDiscussionPoint (source: tblMeetingDiscussionPoints). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_Create
    @AgendaItemId INT,
    @DiscussionPoint NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @AgendaItemId IS NULL
        THROW 50004, N'VALIDATION:AgendaItemId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.MeetingDiscussionPoint ([AgendaItemId], [DiscussionPoint], CreatedBy)
    VALUES (@AgendaItemId, @DiscussionPoint, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingDiscussionPoint', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingDiscussionPointId, [AgendaItemId], [DiscussionPoint]
             FROM app.MeetingDiscussionPoint WHERE MeetingDiscussionPointId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingDiscussionPointId,
           [AgendaItemId],
           [DiscussionPoint],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.MeetingDiscussionPoint
    WHERE MeetingDiscussionPointId = @Id;
END;
GO
