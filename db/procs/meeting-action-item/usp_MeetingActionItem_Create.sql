-- usp_MeetingActionItem_Create — add an action at the end of a discussion point's actions, or of the
-- actions directly under an agenda item (module #10, ADR-0028); audits in-transaction; returns the
-- new row with ProjectId.
-- Parent: @DiscussionPointId, else @AgendaItemId (VALIDATION 50004 when neither). The agenda item and
--   the meeting are always derived from the parent, never taken from the caller: an @AgendaItemId
--   that is not the discussion point's own is VALIDATION 50004. Parents must be live (NOT_FOUND 50001).
-- Person responsible (checklist row 13): @AssignedToStakeholderId must be a live stakeholder of the
--   meeting's project (VALIDATION 50004), checked inside the transaction with that row locked
--   (UPDLOCK, HOLDLOCK) so a concurrent usp_Stakeholder_Delete fails the check or waits. AssigneeName
--   is NULL when nobody is responsible.
-- Status (ADR-0043): 'on-hold' | 'in-progress' | 'completed'. A new action starts 'in-progress',
--   which is what every action was before the status existed. 'completed' is what stops it being
--   carried into the project's later meetings, so the set is closed here and by
--   CK_MeetingActionItem_Status.
-- OnHoldReason (ADR-0044): a new action may be created on hold with its reason; only an action on
--   hold may carry one, so a reason with another status is refused rather than dropped. Same rule
--   as usp_MeetingActionItem_SetStatus and CK_MeetingActionItem_OnHoldReason.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:create, ADR-0024).
--   The meeting row is locked while the position is taken.
-- VALIDATION 50004: empty Action, a status outside the three.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_Create
    @DiscussionPointId       INT           = NULL,
    @AgendaItemId            INT           = NULL,
    @Action                  NVARCHAR(MAX) = NULL,
    @AssignedToStakeholderId INT           = NULL,
    @AssigneeOther           NVARCHAR(255) = NULL,
    @DueDate                 DATETIME2     = NULL,
    @Status                  VARCHAR(12)   = 'in-progress',
    @OnHoldReason            NVARCHAR(500) = NULL,
    @ActorUserId             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT, @ParentAgendaId INT;

    IF @DiscussionPointId IS NOT NULL
    BEGIN
        SELECT @ParentAgendaId = dp.AgendaItemId, @MeetingId = a.MeetingId, @RowProjectId = m.ProjectId
        FROM app.MeetingDiscussionPoint AS dp
        JOIN app.MeetingAgendaItem AS a ON a.MeetingAgendaItemId = dp.AgendaItemId AND a.IsDeleted = 0
        LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
        WHERE dp.MeetingDiscussionPointId = @DiscussionPointId AND dp.IsDeleted = 0
          AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
        IF @@ROWCOUNT = 0
            THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;
        IF @AgendaItemId IS NOT NULL AND @AgendaItemId <> @ParentAgendaId
            THROW 50004, N'VALIDATION:AgendaItemId does not match the discussion point', 1;
        SET @AgendaItemId = @ParentAgendaId;
    END
    ELSE IF @AgendaItemId IS NOT NULL
    BEGIN
        SELECT @MeetingId = a.MeetingId, @RowProjectId = m.ProjectId
        FROM app.MeetingAgendaItem AS a
        LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
        WHERE a.MeetingAgendaItemId = @AgendaItemId AND a.IsDeleted = 0
          AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
        IF @@ROWCOUNT = 0
            THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;
    END
    ELSE
        THROW 50004, N'VALIDATION:DiscussionPointId or AgendaItemId is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:create', @AllowProjectless = 0;

    IF NULLIF(TRIM(@Action), N'') IS NULL
        THROW 50004, N'VALIDATION:Action is required', 1;
    IF @Status IS NULL OR @Status NOT IN ('on-hold', 'in-progress', 'completed')
        THROW 50004, N'VALIDATION:Status must be on-hold, in-progress or completed', 1;

    SET @OnHoldReason = NULLIF(TRIM(@OnHoldReason), N'');
    IF @OnHoldReason IS NOT NULL AND @Status <> 'on-hold'
        THROW 50004, N'VALIDATION:A reason belongs to an action on hold', 1;

    BEGIN TRAN;

    IF @MeetingId IS NOT NULL
    BEGIN
        DECLARE @Locked INT;
        SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)
        WHERE MeetingId = @MeetingId AND IsDeleted = 0;
        IF @Locked IS NULL
            THROW 50001, N'NOT_FOUND:Meeting not found', 1;
    END;
    -- A typed name is for someone with no Stakeholder row; empty text is nobody, not a name.
    SET @AssigneeOther = NULLIF(LTRIM(RTRIM(@AssigneeOther)), N'');
    IF @AssignedToStakeholderId IS NOT NULL AND @AssigneeOther IS NOT NULL
        THROW 50004, N'VALIDATION:An action has one person responsible, not two', 1;
    IF @AssignedToStakeholderId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.Stakeholder AS s WITH (UPDLOCK, HOLDLOCK)
                       WHERE s.StakeholderId = @AssignedToStakeholderId AND s.ProjectId = @RowProjectId
                         AND s.IsDeleted = 0)
        THROW 50004, N'VALIDATION:The person responsible must be a stakeholder of the meeting''s project', 1;
    IF NOT EXISTS (SELECT 1 FROM app.MeetingAgendaItem WHERE MeetingAgendaItemId = @AgendaItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;
    IF @DiscussionPointId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.MeetingDiscussionPoint
                       WHERE MeetingDiscussionPointId = @DiscussionPointId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;

    DECLARE @Position INT =
        ISNULL((SELECT MAX(SortOrder) FROM app.MeetingActionItem
                WHERE IsDeleted = 0
                  AND ((@DiscussionPointId IS NOT NULL AND DiscussionPointId = @DiscussionPointId)
                       OR (@DiscussionPointId IS NULL AND AgendaItemId = @AgendaItemId
                           AND DiscussionPointId IS NULL))), 0) + 1;

    INSERT INTO app.MeetingActionItem ([MeetingId], [AgendaItemId], [DiscussionPointId], [Action],
                                       [AssignedToStakeholderId], [AssigneeOther], [DueDate], [Status],
                                       [OnHoldReason], SortOrder, CreatedBy)
    VALUES (@MeetingId, @AgendaItemId, @DiscussionPointId, @Action,
            @AssignedToStakeholderId, @AssigneeOther, @DueDate, @Status, @OnHoldReason, @Position, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingActionItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingActionItemId, [MeetingId], [AgendaItemId], [DiscussionPointId], [Action],
                    [AssignedToStakeholderId], [AssigneeOther], [DueDate], [Status], [OnHoldReason], SortOrder
             FROM app.MeetingActionItem WHERE MeetingActionItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ai.MeetingActionItemId,
           ai.[MeetingId],
           ai.[AgendaItemId],
           ai.[DiscussionPointId],
           ai.[Action],
           ai.[AssignedToStakeholderId],
           COALESCE(NULLIF(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N''), ai.[AssigneeOther]) AS AssigneeName,
           ai.[DueDate],
           ai.[Status],
           ai.[OnHoldReason],
           ai.SortOrder,
           ai.CreatedAtUtc,
           ai.UpdatedAtUtc,
           CAST(ai.RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingActionItem AS ai
    LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = ai.AssignedToStakeholderId
    WHERE ai.MeetingActionItemId = @Id;
END;
GO
