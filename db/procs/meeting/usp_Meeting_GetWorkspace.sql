-- usp_Meeting_GetWorkspace — everything the meeting workspace shows, in one call (module #10,
-- ADR-0028): one row with the meeting's header fields and its child collections as JSON columns
-- (execProc reads a single recordset), each ordered for display:
--   AgendaItemsJson      [{MeetingAgendaItemId, AgendaItem, SortOrder, RowVer}]
--   DiscussionPointsJson [{MeetingDiscussionPointId, AgendaItemId, DiscussionPoint, SortOrder, RowVer}]
--   ActionItemsJson      [{MeetingActionItemId, AgendaItemId, DiscussionPointId, Action,
--                          AssignedToStakeholderId, AssigneeName (null when nobody is responsible),
--                          DueDate, SortOrder, RowVer}]
--   ParticipantsJson     [{MeetingParticipantId, StakeholderId, Label, IsApology,
--                          StakeholderIsDeleted, RowVer}] (labels as usp_Meeting_GetParticipants)
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
                   ai.SortOrder, CAST(ai.RowVer AS BIGINT) AS RowVer
            FROM app.MeetingActionItem AS ai
            LEFT JOIN app.Stakeholder AS s ON s.StakeholderId = ai.AssignedToStakeholderId
            WHERE ai.MeetingId = m.MeetingId AND ai.IsDeleted = 0
            ORDER BY ai.AgendaItemId, ai.DiscussionPointId, ai.SortOrder, ai.MeetingActionItemId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS ActionItemsJson,
           (SELECT mp.MeetingParticipantId, mp.StakeholderId,
                   CONCAT(TRIM(CONCAT(s.FirstName, N' ', s.LastName)), N' - ' + NULLIF(TRIM(s.OrgTitle), N''), N', ' + NULLIF(TRIM(s.DepartmentOrganization), N'')) AS Label,
                   mp.IsApology, s.IsDeleted AS StakeholderIsDeleted, CAST(mp.RowVer AS BIGINT) AS RowVer
            FROM app.MeetingParticipant AS mp
            JOIN app.Stakeholder AS s ON s.StakeholderId = mp.StakeholderId
            WHERE mp.MeetingId = m.MeetingId AND mp.IsDeleted = 0
            ORDER BY s.FirstName, s.LastName, mp.MeetingParticipantId
            FOR JSON PATH, INCLUDE_NULL_VALUES) AS ParticipantsJson,
           ISNULL((SELECT MAX(CAST(p.RowVer AS BIGINT)) FROM app.MeetingParticipant AS p
                   WHERE p.MeetingId = m.MeetingId), 0) AS ParticipantsStamp,
           @Stamp AS Stamp
    FROM app.Meeting AS m
    WHERE m.MeetingId = @MeetingId AND m.IsDeleted = 0;
END;
GO
