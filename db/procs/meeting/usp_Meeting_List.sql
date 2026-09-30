-- usp_Meeting_List — paged/filtered list per ADR-0016. Search columns: Subject, Location. Sort whitelist: StartDate, Subject.
-- Entity app.Meeting (source: tblMeetingMinutes (recovered)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Meeting_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT MeetingId,
           [ProjectId],
           [Subject],
           [Description],
           [Location],
           [StartDate],
           [StartTime],
           [EndTime],
           [Conclusion],
           [NextMeeting],
           [FollowupAction],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.Meeting
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [Subject] LIKE N'%' + @Search + N'%'
           OR [Location] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'asc'  THEN [StartDate] END ASC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'desc' THEN [StartDate] END DESC,
        CASE WHEN @SortBy = N'Subject' AND @SortDir = 'asc'  THEN [Subject] END ASC,
        CASE WHEN @SortBy = N'Subject' AND @SortDir = 'desc' THEN [Subject] END DESC,
        MeetingId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
