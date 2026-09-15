-- usp_MeetingParticipant_Create — insert one app.MeetingParticipant row; audits in-transaction; returns the new row.
-- Entity app.MeetingParticipant (source: tblMeetingParticipants). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_Create
    @MeetingId INT = NULL,
    @StakeholderId INT,
    @IsApology BIT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @StakeholderId IS NULL
        THROW 50004, N'VALIDATION:StakeholderId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.MeetingParticipant ([MeetingId], [StakeholderId], [IsApology], CreatedBy)
    VALUES (@MeetingId, @StakeholderId, @IsApology, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingParticipant', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingParticipantId, [MeetingId], [StakeholderId], [IsApology]
             FROM app.MeetingParticipant WHERE MeetingParticipantId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingParticipantId,
           [MeetingId],
           [StakeholderId],
           [IsApology],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.MeetingParticipant
    WHERE MeetingParticipantId = @Id;
END;
GO
