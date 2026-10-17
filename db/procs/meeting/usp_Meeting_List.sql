-- usp_Meeting_List — paged/filtered list per ADR-0016 (module #10, ADR-0028).
-- Search columns: Subject, Location, Objective (Objective is stored HTML, so markup can match).
-- Sort whitelist: StartDate, Subject, Location, DateReceived. Default: undated meetings (new drafts)
--   first, then StartDate and StartTime descending.
-- Filters: @DateFrom / @DateTo on StartDate (inclusive days).
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); without it, only meetings of projects the actor is assigned to (Admin sees
--   all, including meetings without a project). LIKE wildcards in @Search are escaped.
-- Rich fields (Description, Objective, Conclusion) come back in full: the datasheet rebuilds the
--   whole update form from a list row (ADR-0023).
-- ActorAccess / ActorGrants / ActorRevokes (ADR-0023, ADR-0024) gate the datasheet's cells per row.
-- MeetingId is the final tiebreaker on every sort path for stable OFFSET paging.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @DateFrom    DATE          = NULL,
    @DateTo      DATE          = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;
    IF @SortBy IS NULL OR @SortBy NOT IN (N'StartDate', N'Subject', N'Location', N'DateReceived')
        SELECT @SortBy = N'StartDate', @SortDir = 'desc';

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_');

    DECLARE @DateToNext DATE = DATEADD(DAY, 1, @DateTo);

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
           ISNULL(pc.AttendeeCount, 0) AS AttendeeCount,
           ISNULL(pc.ApologyCount, 0) AS ApologyCount,
           m.CreatedAtUtc,
           m.UpdatedAtUtc,
           CAST(m.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.Meeting AS m
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, m.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, m.ProjectId, N'meetings') ov
    OUTER APPLY (SELECT SUM(CASE WHEN p.IsApology = 0 THEN 1 ELSE 0 END) AS AttendeeCount,
                        SUM(CASE WHEN p.IsApology = 1 THEN 1 ELSE 0 END) AS ApologyCount
                 FROM app.MeetingParticipant AS p
                 WHERE p.MeetingId = m.MeetingId AND p.IsDeleted = 0) pc
    WHERE m.IsDeleted = 0
      AND (@ProjectId IS NULL OR m.ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Search IS NULL
           OR m.[Subject]   LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR m.[Location]  LIKE N'%' + @Search + N'%' ESCAPE N'\'
           OR m.[Objective] LIKE N'%' + @Search + N'%' ESCAPE N'\')
      AND (@DateFrom IS NULL OR m.[StartDate] >= @DateFrom)
      AND (@DateTo IS NULL OR m.[StartDate] < @DateToNext)
    ORDER BY
        CASE WHEN @SortBy = N'Subject'      AND @SortDir = 'asc'  THEN m.[Subject] END ASC,
        CASE WHEN @SortBy = N'Subject'      AND @SortDir = 'desc' THEN m.[Subject] END DESC,
        CASE WHEN @SortBy = N'Location'     AND @SortDir = 'asc'  THEN m.[Location] END ASC,
        CASE WHEN @SortBy = N'Location'     AND @SortDir = 'desc' THEN m.[Location] END DESC,
        CASE WHEN @SortBy = N'DateReceived' AND @SortDir = 'asc'  THEN m.[DateReceived] END ASC,
        CASE WHEN @SortBy = N'DateReceived' AND @SortDir = 'desc' THEN m.[DateReceived] END DESC,
        CASE WHEN @SortBy = N'StartDate'    AND @SortDir = 'asc'  THEN m.[StartDate] END ASC,
        CASE WHEN @SortBy = N'StartDate'    AND @SortDir = 'asc'  THEN m.[StartTime] END ASC,
        CASE WHEN @SortBy = N'StartDate'    AND @SortDir = 'desc'
             THEN CASE WHEN m.[StartDate] IS NULL THEN 0 ELSE 1 END END ASC,
        CASE WHEN @SortBy = N'StartDate'    AND @SortDir = 'desc' THEN m.[StartDate] END DESC,
        CASE WHEN @SortBy = N'StartDate'    AND @SortDir = 'desc' THEN m.[StartTime] END DESC,
        CASE WHEN @SortDir = 'desc' THEN m.MeetingId END DESC,
        m.MeetingId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
