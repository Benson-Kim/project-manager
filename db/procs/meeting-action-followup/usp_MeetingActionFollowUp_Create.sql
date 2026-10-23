-- usp_MeetingActionFollowUp_Create — add a follow-up at the end of an action item's follow-ups
-- (module #10, ADR-0041); audits in-transaction; returns the row's project and meeting so the app
-- can read the whole workspace back.
-- Parent: @MeetingActionItemId, which must be live and belong to a live meeting (NOT_FOUND 50001).
--   The meeting and the project are derived from it, never taken from the caller.
-- Person assigned: @AssignedToStakeholderId must be a live stakeholder of the meeting's project
--   (VALIDATION 50004), checked inside the transaction with that row locked (UPDLOCK, HOLDLOCK) so
--   a concurrent usp_Stakeholder_Delete fails the check or waits — the same rule the action item's
--   own person responsible follows.
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:create, ADR-0024).
--   The meeting row is locked while the position is taken.
-- VALIDATION 50004: empty FollowUp.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionFollowUp_Create
    @MeetingActionItemId     INT,
    @FollowUp                NVARCHAR(MAX) = NULL,
    @AssignedToStakeholderId INT           = NULL,
    @FollowUpDate            DATE          = NULL,
    @DueDate                 DATE          = NULL,
    @ActorUserId             INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = ai.MeetingId
    FROM app.MeetingActionItem AS ai
    LEFT JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId
    WHERE ai.MeetingActionItemId = @MeetingActionItemId AND ai.IsDeleted = 0
      AND (ai.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:create', @AllowProjectless = 0;

    IF NULLIF(TRIM(@FollowUp), N'') IS NULL
        THROW 50004, N'VALIDATION:FollowUp is required', 1;

    BEGIN TRAN;

    IF @MeetingId IS NOT NULL
    BEGIN
        DECLARE @Locked INT;
        SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK)
        WHERE MeetingId = @MeetingId AND IsDeleted = 0;
        IF @Locked IS NULL
            THROW 50001, N'NOT_FOUND:Meeting not found', 1;
    END;
    IF @AssignedToStakeholderId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.Stakeholder AS s WITH (UPDLOCK, HOLDLOCK)
                       WHERE s.StakeholderId = @AssignedToStakeholderId AND s.ProjectId = @RowProjectId
                         AND s.IsDeleted = 0)
        THROW 50004, N'VALIDATION:The person assigned must be a stakeholder of the meeting''s project', 1;
    IF NOT EXISTS (SELECT 1 FROM app.MeetingActionItem
                   WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

    DECLARE @Position INT =
        ISNULL((SELECT MAX(SortOrder) FROM app.MeetingActionFollowUp
                WHERE MeetingActionItemId = @MeetingActionItemId AND IsDeleted = 0), 0) + 1;

    INSERT INTO app.MeetingActionFollowUp (MeetingActionItemId, [FollowUp],
                                           [AssignedToStakeholderId], [FollowUpDate], [DueDate],
                                           SortOrder, CreatedBy)
    VALUES (@MeetingActionItemId, @FollowUp,
            @AssignedToStakeholderId, @FollowUpDate, @DueDate, @Position, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.MeetingActionFollowUp', CAST(@Id AS NVARCHAR(64)),
            (SELECT MeetingActionFollowUpId, MeetingActionItemId, [FollowUp],
                    [AssignedToStakeholderId], [FollowUpDate], [DueDate], SortOrder
             FROM app.MeetingActionFollowUp WHERE MeetingActionFollowUpId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
