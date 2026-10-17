-- usp_MeetingParticipant_Set — save the participant panel in one call (module #10, checklist rows
-- 13 and 54, ADR-0028 and its amendment of 2026-10-17). @ParticipantsJson lists who attended
-- (isApology false) or sent apologies (true), one item per person:
--   {"stakeholderId": <id>, "isApology": ...}       a stakeholder of the meeting's project;
--   {"guestName": "...", "guestOrganization": "..."|null, "isApology": ...}
--       a guest (migration 033): someone who is not a stakeholder. The trimmed name is the guest's
--       identity in this meeting (case-insensitive, like the unique index); the stored spelling and
--       organization follow the latest save.
-- Everyone else is "not invited":
--   * listed and not yet a participant -> added; listed with another state (a guest: another
--     organization or spelling too) -> switched;
--   * a live project stakeholder who is a participant but not listed -> removed (soft delete), and so
--     is a guest who is not listed;
--   * participants whose stakeholder was deleted since (or is outside the project) are left as they
--     are, so saving the panel never rewrites who came to an old meeting.
-- VALIDATION 50004, nothing written: an item with both identities or neither, a guest name that is
--   empty or longer than 255 (an organization longer than 255 too), a stakeholder or a guest name
--   listed twice, more than 1000 items, or a stakeholder who is not a live stakeholder of the
--   meeting's project. That last check runs inside the transaction with those stakeholder rows
--   locked (UPDLOCK, HOLDLOCK), so a delete of one of them (usp_Stakeholder_Delete takes no meeting
--   lock) lands before it and fails it, or waits.
-- @Stamp: the ParticipantsStamp the client read (usp_Meeting_GetWorkspace). With the meeting row
--   locked (UPDLOCK, HOLDLOCK), a participant row changed since makes the save fail (CONFLICT 50002).
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024):
--   uninviting is an edit of the meeting, unlike usp_MeetingParticipant_Delete (Manager).
-- One audit row (SetParticipants on app.Meeting) holds the before and after lists.
-- Returns ProjectId, MeetingId, the new ParticipantsStamp and the attended / apology counts.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingParticipant_Set
    @MeetingId        INT,
    @ParticipantsJson NVARCHAR(MAX),
    @Stamp            BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF @Stamp IS NULL
        THROW 50004, N'VALIDATION:Stamp is required', 1;
    IF ISJSON(@ParticipantsJson) = 0 OR LEFT(TRIM(@ParticipantsJson), 1) <> N'['
        THROW 50004, N'VALIDATION:ParticipantsJson must be a JSON array', 1;

    DECLARE @Wanted TABLE (
        StakeholderId     INT NULL,
        GuestName         NVARCHAR(MAX) COLLATE DATABASE_DEFAULT NULL,
        GuestOrganization NVARCHAR(MAX) COLLATE DATABASE_DEFAULT NULL,
        IsApology         BIT NULL);
    INSERT INTO @Wanted (StakeholderId, GuestName, GuestOrganization, IsApology)
    SELECT TRY_CAST(v.StakeholderId AS INT),
           NULLIF(TRIM(v.GuestName), N''),
           NULLIF(TRIM(v.GuestOrganization), N''),
           CASE v.IsApology WHEN N'true' THEN 1 WHEN N'false' THEN 0 END
    FROM OPENJSON(@ParticipantsJson) AS j
    OUTER APPLY OPENJSON(CASE WHEN j.[type] = 5 THEN j.[value] END)
        WITH (StakeholderId     NVARCHAR(30)  N'$.stakeholderId',
              GuestName         NVARCHAR(MAX) N'$.guestName',
              GuestOrganization NVARCHAR(MAX) N'$.guestOrganization',
              IsApology         NVARCHAR(10)  N'$.isApology') AS v;

    IF EXISTS (SELECT 1 FROM @Wanted
               WHERE IsApology IS NULL
                  OR NOT ((StakeholderId IS NOT NULL AND GuestName IS NULL AND GuestOrganization IS NULL)
                          OR (StakeholderId IS NULL AND GuestName IS NOT NULL))
                  OR LEN(GuestName) > 255 OR LEN(GuestOrganization) > 255)
       OR (SELECT COUNT(*) FROM @Wanted) > 1000
       OR (SELECT COUNT(*) FROM @Wanted WHERE StakeholderId IS NOT NULL)
          <> (SELECT COUNT(DISTINCT StakeholderId) FROM @Wanted)
       OR (SELECT COUNT(*) FROM @Wanted WHERE GuestName IS NOT NULL)
          <> (SELECT COUNT(*) FROM (SELECT GuestName FROM @Wanted WHERE GuestName IS NOT NULL GROUP BY GuestName) AS g)
        THROW 50004, N'VALIDATION:ParticipantsJson must list each person once, as {stakeholderId, isApology} or {guestName, guestOrganization, isApology}', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)
    WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    IF (SELECT COUNT(*) FROM @Wanted AS w
        JOIN app.Stakeholder AS s WITH (UPDLOCK, HOLDLOCK)
          ON s.StakeholderId = w.StakeholderId AND s.ProjectId = @RowProjectId AND s.IsDeleted = 0)
       <> (SELECT COUNT(*) FROM @Wanted WHERE StakeholderId IS NOT NULL)
        THROW 50004, N'VALIDATION:Every participant must be a stakeholder of the meeting''s project', 1;

    IF ISNULL((SELECT MAX(CAST(RowVer AS BIGINT)) FROM app.MeetingParticipant WHERE MeetingId = @MeetingId), 0) > @Stamp
        THROW 50002, N'CONFLICT:The participants were changed by someone else', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT StakeholderId, GuestName, GuestOrganization, IsApology FROM app.MeetingParticipant
         WHERE MeetingId = @MeetingId AND IsDeleted = 0 ORDER BY StakeholderId, GuestName
         FOR JSON PATH, INCLUDE_NULL_VALUES);

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    UPDATE mp SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    FROM app.MeetingParticipant AS mp
    JOIN app.Stakeholder AS s
        ON s.StakeholderId = mp.StakeholderId AND s.ProjectId = @RowProjectId AND s.IsDeleted = 0
    WHERE mp.MeetingId = @MeetingId AND mp.IsDeleted = 0
      AND NOT EXISTS (SELECT 1 FROM @Wanted AS w WHERE w.StakeholderId = mp.StakeholderId);

    UPDATE mp SET IsApology = w.IsApology, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
    FROM app.MeetingParticipant AS mp
    JOIN @Wanted AS w ON w.StakeholderId = mp.StakeholderId
    WHERE mp.MeetingId = @MeetingId AND mp.IsDeleted = 0 AND mp.IsApology <> w.IsApology;

    INSERT INTO app.MeetingParticipant ([MeetingId], [StakeholderId], [IsApology], CreatedBy)
    SELECT @MeetingId, w.StakeholderId, w.IsApology, @ActorUserId
    FROM @Wanted AS w
    WHERE w.StakeholderId IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM app.MeetingParticipant AS mp
                      WHERE mp.MeetingId = @MeetingId AND mp.StakeholderId = w.StakeholderId
                        AND mp.IsDeleted = 0);

    UPDATE mp SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    FROM app.MeetingParticipant AS mp
    WHERE mp.MeetingId = @MeetingId AND mp.IsDeleted = 0 AND mp.StakeholderId IS NULL
      AND NOT EXISTS (SELECT 1 FROM @Wanted AS w WHERE w.GuestName = mp.GuestName);

    UPDATE mp SET IsApology = w.IsApology, GuestName = w.GuestName, GuestOrganization = w.GuestOrganization,
                  UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
    FROM app.MeetingParticipant AS mp
    JOIN @Wanted AS w ON w.GuestName = mp.GuestName
    WHERE mp.MeetingId = @MeetingId AND mp.IsDeleted = 0 AND mp.StakeholderId IS NULL
      AND (mp.IsApology <> w.IsApology
           OR mp.GuestName COLLATE Latin1_General_BIN2 <> w.GuestName COLLATE Latin1_General_BIN2
           OR ISNULL(mp.GuestOrganization, N'') COLLATE Latin1_General_BIN2
              <> ISNULL(w.GuestOrganization, N'') COLLATE Latin1_General_BIN2);

    INSERT INTO app.MeetingParticipant ([MeetingId], [StakeholderId], GuestName, GuestOrganization, [IsApology], CreatedBy)
    SELECT @MeetingId, NULL, w.GuestName, w.GuestOrganization, w.IsApology, @ActorUserId
    FROM @Wanted AS w
    WHERE w.GuestName IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM app.MeetingParticipant AS mp
                      WHERE mp.MeetingId = @MeetingId AND mp.StakeholderId IS NULL
                        AND mp.GuestName = w.GuestName AND mp.IsDeleted = 0);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'SetParticipants', N'app.Meeting', CAST(@MeetingId AS NVARCHAR(64)), @Before,
            (SELECT StakeholderId, GuestName, GuestOrganization, IsApology FROM app.MeetingParticipant
             WHERE MeetingId = @MeetingId AND IsDeleted = 0 ORDER BY StakeholderId, GuestName
             FOR JSON PATH, INCLUDE_NULL_VALUES));

    COMMIT;

    SELECT @RowProjectId AS ProjectId,
           @MeetingId AS MeetingId,
           ISNULL((SELECT MAX(CAST(RowVer AS BIGINT)) FROM app.MeetingParticipant WHERE MeetingId = @MeetingId), 0)
               AS ParticipantsStamp,
           (SELECT COUNT(*) FROM app.MeetingParticipant
            WHERE MeetingId = @MeetingId AND IsDeleted = 0 AND IsApology = 0) AS AttendeeCount,
           (SELECT COUNT(*) FROM app.MeetingParticipant
            WHERE MeetingId = @MeetingId AND IsDeleted = 0 AND IsApology = 1) AS ApologyCount;
END;
GO
