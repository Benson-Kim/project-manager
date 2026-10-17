-- usp_MeetingParticipant_Delete — soft delete with rowversion concurrency (checked in the
-- transaction) and an in-transaction audit row (module #10, ADR-0028). Returns ProjectId and MeetingId.
-- The meeting row is locked (UPDLOCK, HOLDLOCK) like usp_MeetingParticipant_Set.
-- Access: Manager on the meeting's project, or a per-person grant (meetings:delete, ADR-0024).
-- (The participant panel uninvites through usp_MeetingParticipant_Set, an edit of the meeting.)
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_Delete
    @MeetingParticipantId INT,
    @RowVer               BIGINT,
    @ActorUserId          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = mp.MeetingId
    FROM app.MeetingParticipant AS mp
    LEFT JOIN app.Meeting AS m ON m.MeetingId = mp.MeetingId
    WHERE mp.MeetingParticipantId = @MeetingParticipantId AND mp.IsDeleted = 0
      AND (mp.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingParticipant not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'meetings:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    IF @MeetingId IS NOT NULL
    BEGIN
        DECLARE @Locked INT;
        SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK) WHERE MeetingId = @MeetingId;
    END;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingParticipantId, [MeetingId], [StakeholderId], GuestName, GuestOrganization, [IsApology]
         FROM app.MeetingParticipant WHERE MeetingParticipantId = @MeetingParticipantId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingParticipant SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingParticipant
                       WHERE MeetingParticipantId = @MeetingParticipantId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingParticipant not found', 1;
        THROW 50002, N'CONFLICT:MeetingParticipant was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.MeetingParticipant', CAST(@MeetingParticipantId AS NVARCHAR(64)), @Before,
            (SELECT MeetingParticipantId, IsDeleted, DeletedAtUtc, DeletedBy
             FROM app.MeetingParticipant WHERE MeetingParticipantId = @MeetingParticipantId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
