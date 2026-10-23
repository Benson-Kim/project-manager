-- usp_MeetingActionItem_Update — change an action's text, person responsible and due date with
-- rowversion concurrency (50002 CONFLICT, checked in the transaction) and an in-transaction audit
-- row (module #10, ADR-0028). Its meeting, agenda item, discussion point and position are immutable
-- here (moves go through _Reorder).
-- Person responsible (checklist row 13): a changed @AssignedToStakeholderId must be a live
--   stakeholder of the meeting's project (VALIDATION 50004, checked inside the transaction with that
--   row locked under UPDLOCK, HOLDLOCK so a concurrent usp_Stakeholder_Delete fails the check or
--   waits); an unchanged one stays valid even if that stakeholder was deleted since, so old minutes
--   keep their names. AssigneeName is NULL when nobody is responsible.
-- Status (ADR-0041): 'on-hold' | 'in-progress' | 'completed', always sent, because this is the form
--   that shows it. Ticking an action off from a later meeting's carried-over list goes through
--   usp_MeetingActionItem_SetStatus instead, which holds nothing but the status.
-- OnHoldReason (ADR-0042): only an action on hold may carry one, so moving it on clears it; a
--   reason sent with another status is refused, not dropped. Same rule as
--   usp_MeetingActionItem_SetStatus and CK_MeetingActionItem_OnHoldReason.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- VALIDATION 50004: empty Action, a status outside the three, or a reason without the hold.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_Update
    @MeetingActionItemId     INT,
    @Action                  NVARCHAR(MAX) = NULL,
    @AssignedToStakeholderId INT           = NULL,
    @DueDate                 DATETIME2     = NULL,
    @Status                  VARCHAR(12)   = 'in-progress',
    @OnHoldReason            NVARCHAR(500) = NULL,
    @RowVer                  BIGINT,
    @ActorUserId             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @CurrentAssignee INT;
    SELECT @RowProjectId = m.ProjectId, @CurrentAssignee = ai.AssignedToStakeholderId
    FROM app.MeetingActionItem AS ai
    LEFT JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId
    WHERE ai.MeetingActionItemId = @MeetingActionItemId AND ai.IsDeleted = 0
      AND (ai.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF NULLIF(TRIM(@Action), N'') IS NULL
        THROW 50004, N'VALIDATION:Action is required', 1;
    IF @Status IS NULL OR @Status NOT IN ('on-hold', 'in-progress', 'completed')
        THROW 50004, N'VALIDATION:Status must be on-hold, in-progress or completed', 1;

    SET @OnHoldReason = NULLIF(TRIM(@OnHoldReason), N'');
    IF @OnHoldReason IS NOT NULL AND @Status <> 'on-hold'
        THROW 50004, N'VALIDATION:A reason belongs to an action on hold', 1;

    BEGIN TRAN;

    IF @AssignedToStakeholderId IS NOT NULL
       AND (@CurrentAssignee IS NULL OR @AssignedToStakeholderId <> @CurrentAssignee)
       AND NOT EXISTS (SELECT 1 FROM app.Stakeholder AS s WITH (UPDLOCK, HOLDLOCK)
                       WHERE s.StakeholderId = @AssignedToStakeholderId AND s.ProjectId = @RowProjectId
                         AND s.IsDeleted = 0)
        THROW 50004, N'VALIDATION:The person responsible must be a stakeholder of the meeting''s project', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingActionItemId, [MeetingId], [AgendaItemId], [DiscussionPointId], [Action],
                [AssignedToStakeholderId], [DueDate], [Status], [OnHoldReason], SortOrder
         FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingActionItem SET
        [Action]                  = @Action,
        [AssignedToStakeholderId] = @AssignedToStakeholderId,
        [DueDate]                 = @DueDate,
        [Status]                  = @Status,
        [OnHoldReason]            = @OnHoldReason,
        UpdatedAtUtc              = SYSUTCDATETIME(),
        UpdatedBy                 = @ActorUserId
    WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingActionItem
                       WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;
        THROW 50002, N'CONFLICT:MeetingActionItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingActionItem', CAST(@MeetingActionItemId AS NVARCHAR(64)), @Before,
            (SELECT MeetingActionItemId, [MeetingId], [AgendaItemId], [DiscussionPointId], [Action],
                    [AssignedToStakeholderId], [DueDate], [Status], [OnHoldReason], SortOrder
             FROM app.MeetingActionItem WHERE MeetingActionItemId = @MeetingActionItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ai.MeetingActionItemId,
           ai.[MeetingId],
           ai.[AgendaItemId],
           ai.[DiscussionPointId],
           ai.[Action],
           ai.[AssignedToStakeholderId],
           NULLIF(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N'') AS AssigneeName,
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
    WHERE ai.MeetingActionItemId = @MeetingActionItemId;
END;
GO
