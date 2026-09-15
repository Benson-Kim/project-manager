-- usp_MeetingParticipant_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.MeetingParticipant (source: tblMeetingParticipants). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_Update
    @MeetingParticipantId INT,
    @MeetingId INT = NULL,
    @StakeholderId INT,
    @IsApology BIT,
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
        [MeetingId] = @MeetingId,
        [StakeholderId] = @StakeholderId,
        [IsApology] = @IsApology,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingParticipant', CAST(@MeetingParticipantId AS NVARCHAR(64)), @Before,
            (SELECT MeetingParticipantId, [MeetingId], [StakeholderId], [IsApology]
             FROM app.MeetingParticipant WHERE MeetingParticipantId = @MeetingParticipantId
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
    WHERE MeetingParticipantId = @MeetingParticipantId;
END;
GO
