-- usp_MeetingMinutesSection_Save — writes one minutes section (087): a built-in section's title (and its
--   text, such as the conclusion), or a box the user added.
--   @MeetingMinutesSectionId NULL adds: with @SectionKey, the built-in section's row (CONFLICT 50002 when the
--   meeting already has one, so a second writer reloads); without it, a new box at the end. Otherwise it updates
--   that row under rowversion concurrency (50002). The key of a row never changes.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update).
-- VALIDATION 50004: empty Title, unknown SectionKey. Returns MeetingId for the workspace re-read.
USE ProjectManager;
GO

CREATE OR ALTER PROCEDURE dbo.usp_MeetingMinutesSection_Save
    @MeetingId               INT,
    @MeetingMinutesSectionId INT           = NULL,
    @SectionKey              NVARCHAR(32)  = NULL,
    @Title                   NVARCHAR(200),
    @Body                    NVARCHAR(MAX) = NULL,
    @RowVer                  BIGINT        = NULL,
    @ActorUserId             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT;
    SELECT @ProjectId = m.ProjectId
    FROM app.Meeting AS m
    WHERE m.MeetingId = @MeetingId AND m.IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF NULLIF(TRIM(@Title), N'') IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;
    IF @SectionKey IS NOT NULL
       AND @SectionKey NOT IN (N'CarryOver', N'Agenda')
        THROW 50004, N'VALIDATION:Unknown section', 1;

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();
    DECLARE @Id INT = @MeetingMinutesSectionId;
    DECLARE @Before NVARCHAR(MAX);

    BEGIN TRAN;

    IF @Id IS NULL
    BEGIN
        IF @SectionKey IS NOT NULL
           AND EXISTS (SELECT 1 FROM app.MeetingMinutesSection WITH (UPDLOCK, HOLDLOCK)
                       WHERE MeetingId = @MeetingId AND SectionKey = @SectionKey AND IsDeleted = 0)
            THROW 50002, N'CONFLICT:MeetingMinutesSection was modified by someone else', 1;

        INSERT INTO app.MeetingMinutesSection (MeetingId, SectionKey, Title, Body, SortOrder, CreatedBy)
        VALUES (@MeetingId, @SectionKey, TRIM(@Title), @Body,
                (SELECT ISNULL(MAX(SortOrder), 0) + 1 FROM app.MeetingMinutesSection
                 WHERE MeetingId = @MeetingId AND IsDeleted = 0),
                @ActorUserId);
        SET @Id = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        SET @Before = (SELECT MeetingMinutesSectionId, MeetingId, SectionKey, Title, Body, SortOrder
                       FROM app.MeetingMinutesSection WHERE MeetingMinutesSectionId = @Id
                       FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

        UPDATE app.MeetingMinutesSection SET
            Title        = TRIM(@Title),
            Body         = @Body,
            UpdatedAtUtc = @Now,
            UpdatedBy    = @ActorUserId
        WHERE MeetingMinutesSectionId = @Id AND MeetingId = @MeetingId AND IsDeleted = 0
          AND CAST(RowVer AS BIGINT) = @RowVer;

        IF @@ROWCOUNT = 0
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM app.MeetingMinutesSection
                           WHERE MeetingMinutesSectionId = @Id AND MeetingId = @MeetingId AND IsDeleted = 0)
                THROW 50001, N'NOT_FOUND:MeetingMinutesSection not found', 1;
            THROW 50002, N'CONFLICT:MeetingMinutesSection was modified by someone else', 1;
        END
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, CASE WHEN @Before IS NULL THEN N'Create' ELSE N'Update' END,
            N'app.MeetingMinutesSection', CAST(@Id AS NVARCHAR(64)), @Before,
            (SELECT MeetingMinutesSectionId, MeetingId, SectionKey, Title, Body, SortOrder
             FROM app.MeetingMinutesSection WHERE MeetingMinutesSectionId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @ProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
