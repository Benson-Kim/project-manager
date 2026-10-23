-- usp_MeetingActionFollowUp_Update — change a follow-up's text, person assigned, follow-up date and
-- due date with rowversion concurrency (50002 CONFLICT, checked in the transaction) and an
-- in-transaction audit row (module #10, ADR-0043). Its action item, meeting and position are
-- immutable here (moves go through _Reorder).
-- Person assigned: a changed @AssignedToStakeholderId must be a live stakeholder of the meeting's
--   project (VALIDATION 50004, checked inside the transaction with that row locked under UPDLOCK,
--   HOLDLOCK so a concurrent usp_Stakeholder_Delete fails the check or waits); an unchanged one
--   stays valid even if that stakeholder was deleted since, so old minutes keep their names.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- VALIDATION 50004: empty FollowUp.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionFollowUp_Update
    @MeetingActionFollowUpId INT,
    @FollowUp                NVARCHAR(MAX) = NULL,
    @AssignedToStakeholderId INT           = NULL,
    @FollowUpDate            DATE          = NULL,
    @DueDate                 DATE          = NULL,
    @RowVer                  BIGINT,
    @ActorUserId             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT, @CurrentAssignee INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = ai.MeetingId,
           @CurrentAssignee = fu.AssignedToStakeholderId
    FROM app.MeetingActionFollowUp AS fu
    JOIN app.MeetingActionItem AS ai
        ON ai.MeetingActionItemId = fu.MeetingActionItemId AND ai.IsDeleted = 0
    LEFT JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId
    WHERE fu.MeetingActionFollowUpId = @MeetingActionFollowUpId AND fu.IsDeleted = 0
      AND (ai.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingActionFollowUp not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF NULLIF(TRIM(@FollowUp), N'') IS NULL
        THROW 50004, N'VALIDATION:FollowUp is required', 1;

    BEGIN TRAN;

    IF @AssignedToStakeholderId IS NOT NULL
       AND (@CurrentAssignee IS NULL OR @AssignedToStakeholderId <> @CurrentAssignee)
       AND NOT EXISTS (SELECT 1 FROM app.Stakeholder AS s WITH (UPDLOCK, HOLDLOCK)
                       WHERE s.StakeholderId = @AssignedToStakeholderId AND s.ProjectId = @RowProjectId
                         AND s.IsDeleted = 0)
        THROW 50004, N'VALIDATION:The person assigned must be a stakeholder of the meeting''s project', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingActionFollowUpId, MeetingActionItemId, [FollowUp],
                [AssignedToStakeholderId], [FollowUpDate], [DueDate], SortOrder
         FROM app.MeetingActionFollowUp WHERE MeetingActionFollowUpId = @MeetingActionFollowUpId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingActionFollowUp SET
        [FollowUp]                = @FollowUp,
        [AssignedToStakeholderId] = @AssignedToStakeholderId,
        [FollowUpDate]            = @FollowUpDate,
        [DueDate]                 = @DueDate,
        UpdatedAtUtc              = SYSUTCDATETIME(),
        UpdatedBy                 = @ActorUserId
    WHERE MeetingActionFollowUpId = @MeetingActionFollowUpId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingActionFollowUp
                       WHERE MeetingActionFollowUpId = @MeetingActionFollowUpId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingActionFollowUp not found', 1;
        THROW 50002, N'CONFLICT:MeetingActionFollowUp was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingActionFollowUp',
            CAST(@MeetingActionFollowUpId AS NVARCHAR(64)), @Before,
            (SELECT MeetingActionFollowUpId, MeetingActionItemId, [FollowUp],
                    [AssignedToStakeholderId], [FollowUpDate], [DueDate], SortOrder
             FROM app.MeetingActionFollowUp WHERE MeetingActionFollowUpId = @MeetingActionFollowUpId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
