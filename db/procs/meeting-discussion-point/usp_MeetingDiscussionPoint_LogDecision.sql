-- usp_MeetingDiscussionPoint_LogDecision — logs a meeting's discussion point as a decision in the
--   project's decision log and links the point to it, in one transaction (077).
--   @Title is the point as plain text, made by the app, which already turns rich text into text.
--   The point's own rich text becomes the decision's problem context, and the meeting's start
--   date its logged date. Numbering follows usp_Decision_Create under the same project lock.
--   A point already linked to a live decision returns that decision unchanged, so a double click
--   never logs it twice.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_LogDecision
    @MeetingDiscussionPointId INT,
    @RowVer                   BIGINT,
    @Title                    NVARCHAR(255),
    @ActorUserId              INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @MeetingId INT, @MeetingDate DATETIME2, @Text NVARCHAR(MAX);
    SELECT @ProjectId = m.ProjectId, @MeetingId = m.MeetingId, @MeetingDate = m.StartDate, @Text = dp.DiscussionPoint
    FROM app.MeetingDiscussionPoint AS dp
    JOIN app.MeetingAgendaItem AS a ON a.MeetingAgendaItemId = dp.AgendaItemId AND a.IsDeleted = 0
    JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId AND m.IsDeleted = 0
    WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId AND dp.IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'decisions:create', @AllowProjectless = 0;

    IF NULLIF(TRIM(@Title), N'') IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK)
    WHERE ProjectId = @ProjectId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    DECLARE @CurrentVer BIGINT, @LinkedId INT;
    SELECT @CurrentVer = CAST(dp.RowVer AS BIGINT), @LinkedId = d.DecisionId
    FROM app.MeetingDiscussionPoint AS dp WITH (UPDLOCK)
    LEFT JOIN app.Decision AS d ON d.DecisionId = dp.DecisionId AND d.IsDeleted = 0
    WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId AND dp.IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;

    IF @LinkedId IS NULL
    BEGIN
        IF @CurrentVer <> @RowVer
            THROW 50002, N'CONFLICT:The discussion point was changed by someone else', 1;

        DECLARE @DecisionNumber INT =
            ISNULL((SELECT MAX(DecisionNumber) FROM app.Decision WHERE ProjectId = @ProjectId), 0) + 1;

        INSERT INTO app.Decision
            ([ProjectId], DecisionNumber, [Title], [DateLogged], [ProblemContext],
             CreatedAtUtc, CreatedBy)
        VALUES
            (@ProjectId, @DecisionNumber, TRIM(@Title), ISNULL(@MeetingDate, @Now), @Text,
             @Now, @ActorUserId);
        SET @LinkedId = SCOPE_IDENTITY();

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Create', N'app.Decision', CAST(@LinkedId AS NVARCHAR(64)),
                (SELECT DecisionId, [ProjectId], DecisionNumber, [Title], [DateLogged],
                        [ProblemContext], @MeetingDiscussionPointId AS FromDiscussionPointId
                 FROM app.Decision WHERE DecisionId = @LinkedId
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        UPDATE app.MeetingDiscussionPoint
        SET DecisionId = @LinkedId, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
        WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Update', N'app.MeetingDiscussionPoint',
                CAST(@MeetingDiscussionPointId AS NVARCHAR(64)),
                (SELECT @MeetingDiscussionPointId AS MeetingDiscussionPointId,
                        @LinkedId AS DecisionId
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT @ProjectId AS ProjectId, @MeetingId AS MeetingId, d.DecisionId, d.DecisionNumber,
           CAST(dp.RowVer AS BIGINT) AS RowVer
    FROM app.MeetingDiscussionPoint AS dp
    JOIN app.Decision AS d ON d.DecisionId = dp.DecisionId
    WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId;
END;
GO
