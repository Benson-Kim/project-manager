-- usp_Meeting_GetWorkspace — everything the meeting workspace shows, in one call (module #10,
-- ADR-0028): one row with the meeting's header fields and its child collections as JSON columns
-- (execProc reads a single recordset), each ordered for display:
--   AgendaItemsJson      [{MeetingAgendaItemId, AgendaItem, SortOrder, RowVer}]
--   DiscussionPointsJson [{MeetingDiscussionPointId, AgendaItemId, DiscussionPoint, SortOrder, RowVer}]
--   ActionItemsJson      [{MeetingActionItemId, AgendaItemId, DiscussionPointId, Action,
--                          AssignedToStakeholderId, AssigneeName (null when nobody is responsible),
--                          DueDate, Status, OnHoldReason (ADR-0044; null unless on hold),
--                          SortOrder, RowVer}]
--   FollowUpsJson        [{MeetingActionFollowUpId, MeetingActionItemId, FollowUp,
--                          AssignedToStakeholderId, AssigneeName, FollowUpDate, DueDate, SortOrder,
--                          RowVer}] — the one-to-many under an action item (ADR-0043)
--   CarriedOverJson      [{MeetingActionItemId, Action, Status, OnHoldReason, AssignedToStakeholderId,
--                          AssigneeName, DueDate, RowVer, FromMeetingId, FromSubject,
--                          FromStartDate}] — the unfinished actions of this project's EARLIER
--     meetings, which carry into every later one until they are 'completed' (ADR-0043). Read-only
--     here apart from the status and its reason, which usp_MeetingActionItem_SetStatus takes. Same project only,
--     so it shows nothing this actor was not already granted by the check below, and capped at
--     @CarryOverMax rows. "Earlier" is (StartDate, MeetingId) with an undated meeting last, so a
--     new draft sees the project's open actions and never leaks into a past meeting.
--   ParticipantsJson     [{MeetingParticipantId, StakeholderId, GuestName, GuestOrganization, Label,
--                          IsApology, StakeholderIsDeleted, RowVer}] (labels as
--                          usp_Meeting_GetParticipants; a guest has StakeholderId null, migration 033)
-- ParticipantsStamp: the highest RowVer among the meeting's participant rows, deleted ones included;
--   usp_MeetingParticipant_Set refuses a save made from an older stamp (CONFLICT 50002).
-- Stamp: MIN_ACTIVE_ROWVERSION() before the rows are read, so a client can keep the newest read.
-- Access: Viewer on the meeting's project (FORBIDDEN_ROW 50003); NOT_FOUND 50001 for a missing meeting.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_GetWorkspace
    @MeetingId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId FROM app.Meeting WHERE MeetingId = @MeetingId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Meeting not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    DECLARE @Stamp BIGINT = CAST(MIN_ACTIVE_ROWVERSION() AS BIGINT);
    -- The app's MEETING_CARRY_OVER_MAX; a project with more unfinished actions than this is
    -- already past the point where one list helps.
    DECLARE @CarryOverMax INT = 500;
    -- An undated meeting sorts last, so it is "later" than every dated one.
    DECLARE @Undated DATE = '9999-12-31';

    SELECT m.MeetingId,
           m.[ProjectId],
           m.[Subject],
           m.[Objective],
           m.[DateReceived],
           m.[Description],
           m.[Location],
           m.[StartDate],
           m.[StartTime],
           m.[EndTime],
           m.[Conclusion],
           m.[NextMeeting],
           m.[FollowupAction],
           m.CreatedAtUtc,
           m.UpdatedAtUtc,
           CAST(m.RowVer AS BIGINT) AS RowVer,
           (SELECT a.MeetingAgendaItemId, a.AgendaItem, a.SortOrder, CAST(a.RowVer AS BIGINT) AS RowVer
            FROM app.MeetingAgendaItem AS a
            WHERE a.MeetingId = m.MeetingId AND a.IsDeleted = 0
            ORDER BY a.SortOrder, a.MeetingAgendaItemId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS AgendaItemsJson,
           (SELECT dp.MeetingDiscussionPointId, dp.AgendaItemId, dp.DiscussionPoint, dp.SortOrder,
                   CAST(dp.RowVer AS BIGINT) AS RowVer
            FROM app.MeetingDiscussionPoint AS dp
            JOIN app.MeetingAgendaItem AS a
                ON a.MeetingAgendaItemId = dp.AgendaItemId AND a.IsDeleted = 0
            WHERE a.MeetingId = m.MeetingId AND dp.IsDeleted = 0
            ORDER BY a.SortOrder, a.MeetingAgendaItemId, dp.SortOrder, dp.MeetingDiscussionPointId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS DiscussionPointsJson,
           (SELECT ai.MeetingActionItemId, ai.AgendaItemId, ai.DiscussionPointId, ai.[Action],
                   ai.AssignedToStakeholderId,
                   NULLIF(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N'') AS AssigneeName,
                   CAST(ai.DueDate AS DATE) AS DueDate,
                   ai.[Status], ai.[OnHoldReason],
                   ai.SortOrder, CAST(ai.RowVer AS BIGINT) AS RowVer
            FROM app.MeetingActionItem AS ai
            LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = ai.AssignedToStakeholderId
            WHERE ai.MeetingId = m.MeetingId AND ai.IsDeleted = 0
            ORDER BY ai.AgendaItemId, ai.DiscussionPointId, ai.SortOrder, ai.MeetingActionItemId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS ActionItemsJson,
           (SELECT fu.MeetingActionFollowUpId, fu.MeetingActionItemId, fu.[FollowUp],
                   fu.AssignedToStakeholderId,
                   NULLIF(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N'') AS AssigneeName,
                   fu.[FollowUpDate], fu.[DueDate],
                   fu.SortOrder, CAST(fu.RowVer AS BIGINT) AS RowVer
            FROM app.MeetingActionFollowUp AS fu
            JOIN app.MeetingActionItem AS ai
                ON ai.MeetingActionItemId = fu.MeetingActionItemId AND ai.IsDeleted = 0
            LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = fu.AssignedToStakeholderId
            WHERE ai.MeetingId = m.MeetingId AND fu.IsDeleted = 0
            ORDER BY fu.MeetingActionItemId, fu.SortOrder, fu.MeetingActionFollowUpId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS FollowUpsJson,
           (SELECT TOP (@CarryOverMax)
                   ai.MeetingActionItemId, ai.[Action], ai.[Status], ai.[OnHoldReason],
                   ai.AssignedToStakeholderId,
                   NULLIF(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N'') AS AssigneeName,
                   CAST(ai.DueDate AS DATE) AS DueDate,
                   CAST(ai.RowVer AS BIGINT) AS RowVer,
                   src.MeetingId AS FromMeetingId, src.[Subject] AS FromSubject,
                   CAST(src.StartDate AS DATE) AS FromStartDate
            FROM app.MeetingActionItem AS ai
            JOIN app.Meeting AS src ON src.MeetingId = ai.MeetingId AND src.IsDeleted = 0
            LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = ai.AssignedToStakeholderId
            WHERE ai.IsDeleted = 0 AND ai.[Status] <> 'completed'
              AND src.ProjectId = m.ProjectId AND src.MeetingId <> m.MeetingId
              AND (ISNULL(CAST(src.StartDate AS DATE), @Undated) < ISNULL(CAST(m.StartDate AS DATE), @Undated)
                   OR (ISNULL(CAST(src.StartDate AS DATE), @Undated) = ISNULL(CAST(m.StartDate AS DATE), @Undated)
                       AND src.MeetingId < m.MeetingId))
            ORDER BY ISNULL(CAST(src.StartDate AS DATE), @Undated) DESC, src.MeetingId DESC,
                     ai.SortOrder, ai.MeetingActionItemId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS CarriedOverJson,
           (SELECT mp.MeetingParticipantId, mp.StakeholderId, mp.GuestName, mp.GuestOrganization,
                   CASE WHEN mp.StakeholderId IS NULL THEN CONCAT(mp.GuestName, N' - ' + NULLIF(TRIM(mp.GuestOrganization), N'')) ELSE CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) END AS Label,
                   mp.IsApology, ISNULL(s.IsDeleted, 0) AS StakeholderIsDeleted, CAST(mp.RowVer AS BIGINT) AS RowVer
            FROM app.MeetingParticipant AS mp
            LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId
            WHERE mp.MeetingId = m.MeetingId AND mp.IsDeleted = 0
            ORDER BY COALESCE(s.FirstName, mp.GuestName), s.LastName, mp.MeetingParticipantId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS ParticipantsJson,
           ISNULL((SELECT MAX(CAST(p.RowVer AS BIGINT)) FROM app.MeetingParticipant AS p
                   WHERE p.MeetingId = m.MeetingId), 0) AS ParticipantsStamp,
           @Stamp AS Stamp
    FROM app.Meeting AS m
    WHERE m.MeetingId = @MeetingId AND m.IsDeleted = 0;
END;
GO
