-- usp_MeetingAgendaItem_List — paged/filtered list per ADR-0016. Search columns: AgendaItem. Sort whitelist: (default MeetingAgendaItemId only).
-- Entity app.MeetingAgendaItem (source: tblMeetingAgenda). Module: database-schema-and-procs (#3).

-- @ProjectId is accepted for contract uniformity but ignored (entity is not project-scoped).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @MeetingId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT MeetingAgendaItemId,
           [MeetingId],
           [AgendaItem],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.MeetingAgendaItem
    WHERE IsDeleted = 0
      AND (@MeetingId IS NULL OR [MeetingId] = @MeetingId)
      AND (@Search IS NULL OR [AgendaItem] LIKE N'%' + @Search + N'%')
    ORDER BY
        MeetingAgendaItemId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
