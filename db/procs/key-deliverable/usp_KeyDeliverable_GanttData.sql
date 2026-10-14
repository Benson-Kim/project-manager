-- usp_KeyDeliverable_GanttData — the project's work breakdown, which draws the Gantt (checklist
-- row 67, module #9, ADR-0027). Returns every active deliverable of the project, dated or not, with
-- its place in the breakdown (ParentKeyDeliverableId, SortOrder), StartDate and Deadline (the bar),
-- Color, assignees, and the project window (StartDate/EndDate) for a new item's default dates.
-- Ordered parent by parent; the app builds the tree, numbers it and rolls up nothing itself
-- (the write procs keep parent dates rolled up).
-- @WithProjectRow = 1: a project without items still returns one row (KeyDeliverableId NULL) for
--   the project window. Off by default, so an app from before 032 (another user's desktop install
--   on the same database) never gets a row it cannot read.
-- Stamp (MIN_ACTIVE_ROWVERSION, read before the rows) orders two reads: the editor keeps the
--   breakdown it has when a page refresh brings an older one than its last save returned.
-- Row-level access: the project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_GanttData
    @ProjectId      INT,
    @ActorUserId    INT,
    @WithProjectRow BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    DECLARE @Stamp BIGINT = CAST(MIN_ACTIVE_ROWVERSION() AS BIGINT);

    SELECT kd.KeyDeliverableId,
           kd.ProjectId,
           kd.ParentKeyDeliverableId,
           kd.SortOrder,
           kd.[KeyRequirement],
           kd.[RequestedDate],
           kd.StartDate,
           kd.[Deadline],
           kd.[Priority],
           kd.[Status],
           kd.Color,
           kd.CreatedAtUtc,
           p.[StartDate] AS ProjectStartDate,
           p.[EndDate]   AS ProjectEndDate,
           @Stamp        AS Stamp,
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
           ) AS AssigneesJson
    FROM app.Project AS p
    LEFT JOIN app.KeyDeliverable AS kd
        ON kd.ProjectId = p.ProjectId AND kd.IsDeleted = 0
    WHERE p.ProjectId = @ProjectId
      AND (kd.KeyDeliverableId IS NOT NULL OR @WithProjectRow = 1)
    ORDER BY kd.ParentKeyDeliverableId, kd.SortOrder, kd.KeyDeliverableId;
END;
GO
