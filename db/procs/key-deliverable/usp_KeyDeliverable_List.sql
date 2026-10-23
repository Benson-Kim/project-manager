-- usp_KeyDeliverable_List — paged/filtered list per ADR-0016 with assignee names.
-- Search columns: KeyRequirement. Sort whitelist: Wbs, StartDate, Deadline, Priority, Status.
-- Filters @Status/@Priority added by module #9 (list page filter bar).
-- Work breakdown (ADR-0027): WbsCode is the item's number in its project's breakdown ("1.2.3",
--   each part the item's place among its live siblings) and the Wbs sort follows it, so the list
--   reads in breakdown order. HasChildren marks items whose dates come from their sub-items.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor is assigned to (Admin sees all). LIKE wildcards in @Search are escaped.
-- ActorAccess (ADR-0023): the actor's access level on each row's project (dbo.ufn_AccessLevel_Resolve);
--   the datasheet uses it to decide per row whether cells are editable. The cross-project filter
--   reads the same rule: a row is listed when the actor has a level on it.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: key-deliverables (#9).
-- ActorGrants / ActorRevokes (ADR-0024): the actor's per-person overrides of 'key-deliverables' in the
--   row's project (dbo.ufn_Permission_Overrides), so the datasheet gates cells as the procs do.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @Status      NVARCHAR(255) = NULL,
    @Priority    NVARCHAR(255) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25
AS
BEGIN
    SET NOCOUNT ON;

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

    WITH placed AS (
        SELECT k.KeyDeliverableId, k.ParentKeyDeliverableId,
               ROW_NUMBER() OVER (PARTITION BY k.ProjectId, k.ParentKeyDeliverableId
                                  ORDER BY k.SortOrder, k.KeyDeliverableId) AS Position
        FROM app.KeyDeliverable AS k
        WHERE k.IsDeleted = 0 AND (@ProjectId IS NULL OR k.ProjectId = @ProjectId)
    ),
    wbs AS (
        SELECT p.KeyDeliverableId,
               CAST(p.Position AS NVARCHAR(400)) AS WbsCode,
               CAST(RIGHT(N'0000' + CAST(p.Position AS NVARCHAR(10)), 5) AS NVARCHAR(400)) AS WbsKey,
               1 AS Lvl
        FROM placed AS p
        WHERE p.ParentKeyDeliverableId IS NULL
        UNION ALL
        SELECT c.KeyDeliverableId,
               CAST(w.WbsCode + N'.' + CAST(c.Position AS NVARCHAR(10)) AS NVARCHAR(400)),
               CAST(w.WbsKey + N'.' + RIGHT(N'0000' + CAST(c.Position AS NVARCHAR(10)), 5) AS NVARCHAR(400)),
               w.Lvl + 1
        FROM wbs AS w
        JOIN placed AS c ON c.ParentKeyDeliverableId = w.KeyDeliverableId
        WHERE w.Lvl < 50
    )
    SELECT kd.KeyDeliverableId,
           kd.[ProjectId],
           kd.ParentKeyDeliverableId,
           kd.SortOrder,
           w.WbsCode,
           kd.[KeyRequirement],
           kd.[RequestedDate],
           kd.StartDate,
           kd.[Deadline],
           kd.[Priority],
           kd.[Status],
           kd.Color,
           CAST(CASE WHEN EXISTS (SELECT 1 FROM app.KeyDeliverable AS ch
                                  WHERE ch.ParentKeyDeliverableId = kd.KeyDeliverableId
                                    AND ch.IsDeleted = 0)
                     THEN 1 ELSE 0 END AS BIT) AS HasChildren,
           kd.CreatedAtUtc,
           kd.UpdatedAtUtc,
           CAST(kd.RowVer AS BIGINT) AS RowVer,
           (
               SELECT STRING_AGG(
                   CAST(LTRIM(RTRIM(CONCAT(ISNULL(s.FirstName,''), N' ', ISNULL(s.LastName,'')))) AS NVARCHAR(MAX)),
                   N', '
               ) WITHIN GROUP (ORDER BY s.FirstName, s.LastName)
               FROM app.KeyDeliverableAssignee AS a
               JOIN app.Stakeholder AS s
                   ON s.StakeholderId = a.StakeholderId AND s.IsDeleted = 0
               WHERE a.KeyDeliverableId = kd.KeyDeliverableId
           ) AS AssigneeNames,
           (
               SELECT CAST(a.StakeholderId AS NVARCHAR(20)) AS id,
                      LTRIM(RTRIM(CONCAT(ISNULL(s.FirstName,''), N' ', ISNULL(s.LastName,'')))) AS name
               FROM app.KeyDeliverableAssignee AS a
               JOIN app.Stakeholder AS s
                   ON s.StakeholderId = a.StakeholderId AND s.IsDeleted = 0
               WHERE a.KeyDeliverableId = kd.KeyDeliverableId
               FOR JSON PATH
           ) AS AssigneesJson,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.KeyDeliverable AS kd
    LEFT JOIN wbs AS w ON w.KeyDeliverableId = kd.KeyDeliverableId
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, kd.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, kd.ProjectId, N'key-deliverables') ov
    WHERE kd.IsDeleted = 0
      AND (@ProjectId IS NULL OR kd.ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Search IS NULL OR kd.[KeyRequirement] LIKE N'%' + @Search + N'%' ESCAPE N'\')
      AND (@Status IS NULL OR kd.[Status] = @Status)
      AND (@Priority IS NULL OR kd.[Priority] = @Priority)
    ORDER BY
        CASE WHEN @SortBy = N'Wbs' AND @SortDir = 'asc'  THEN w.WbsKey END ASC,
        CASE WHEN @SortBy = N'Wbs' AND @SortDir = 'desc' THEN w.WbsKey END DESC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'asc'  THEN kd.StartDate END ASC,
        CASE WHEN @SortBy = N'StartDate' AND @SortDir = 'desc' THEN kd.StartDate END DESC,
        CASE WHEN @SortBy = N'Deadline' AND @SortDir = 'asc'  THEN kd.[Deadline] END ASC,
        CASE WHEN @SortBy = N'Deadline' AND @SortDir = 'desc' THEN kd.[Deadline] END DESC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'asc'  THEN kd.[Priority] END ASC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'desc' THEN kd.[Priority] END DESC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'asc'  THEN kd.[Status] END ASC,
        CASE WHEN @SortBy = N'Status' AND @SortDir = 'desc' THEN kd.[Status] END DESC,
        kd.KeyDeliverableId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
