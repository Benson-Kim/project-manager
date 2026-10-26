-- usp_KeyDeliverable_GanttData — the project's work breakdown, which draws the Gantt (checklist
-- row 67, module #9, ADR-0027). Returns every active deliverable of the project, dated or not, with
-- its place in the breakdown (ParentKeyDeliverableId, SortOrder), StartDate and Deadline (the bar),
-- Color, IsMilestone (a date rather than a span, drawn as a diamond — ADR-0046), assignees, and
-- the project window (StartDate/EndDate) for a new item's default dates.
-- Ordered parent by parent; the app builds the tree, numbers it and rolls up nothing itself
-- (the write procs keep parent dates rolled up).
-- @WithProjectRow = 1: a project without items still returns one row (KeyDeliverableId NULL) for
--   the project window. Off by default, so an app from before 032 (another user's desktop install
--   on the same database) never gets a row it cannot read.
-- Stamp orders two reads: the editor keeps the breakdown it has when a page refresh brings an
--   older one than its last save returned. It is the newest RowVer among the project's items,
--   deleted ones included (a delete is an UPDATE, so it moves the stamp too), read before the rows.
--   Every write to an item locks app.Project first, so RowVer order is commit order. Equal stamps
--   mean the same items; a later read with an equal stamp may still bring newer names or project
--   dates, so the editor takes it.
-- PredecessorsJson: the live links whose SUCCESSOR is this row, each with its dependencyId,
--   predecessorId, type, lagDays and rowVer (ADR-0046 decisions 5-10). Every link has exactly one
--   successor, so the whole graph arrives once rather than twice, and the editor reads a link's
--   other end from the row it is drawn on. The stamp also covers app.KeyDeliverableDependency by
--   ProjectId, so linking, retyping or unlinking moves it and a refresh cannot restore stale
--   arrows.
-- RequirementsJson: the solution requirements allocated to the item, in allocation order
--   (ADR-0037), each with its type, reference number and the allocation's RowVer. The stamp also
--   covers app.Requirement and app.RequirementDeliverable by ProjectId, so any register edit or
--   allocation change moves it.
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

    DECLARE @Stamp BIGINT =
        ISNULL((SELECT MAX(CAST(RowVer AS BIGINT)) FROM app.KeyDeliverable WHERE ProjectId = @ProjectId), 0);
    DECLARE @RequirementStamp BIGINT =
        ISNULL((SELECT MAX(CAST(RowVer AS BIGINT)) FROM app.Requirement WHERE ProjectId = @ProjectId), 0);
    DECLARE @AllocationStamp BIGINT =
        ISNULL((SELECT MAX(CAST(RowVer AS BIGINT)) FROM app.RequirementDeliverable WHERE ProjectId = @ProjectId), 0);
    DECLARE @DependencyStamp BIGINT =
        ISNULL((SELECT MAX(CAST(RowVer AS BIGINT)) FROM app.KeyDeliverableDependency WHERE ProjectId = @ProjectId), 0);
    IF @RequirementStamp > @Stamp SET @Stamp = @RequirementStamp;
    IF @AllocationStamp > @Stamp SET @Stamp = @AllocationStamp;
    IF @DependencyStamp > @Stamp SET @Stamp = @DependencyStamp;

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
           kd.[IsMilestone],
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
           ) AS AssigneesJson,
           (
               SELECT r.RequirementId          AS id,
                      r.RequirementType         AS [type],
                      r.Number                  AS [number],
                      r.Requirement             AS requirement,
                      r.IsMet                   AS isMet,
                      d.SortOrder               AS sortOrder,
                      CAST(r.RowVer AS BIGINT)  AS rowVer,
                      CAST(d.RowVer AS BIGINT)  AS placeRowVer
               FROM app.RequirementDeliverable AS d
               JOIN app.Requirement AS r
                   ON r.RequirementId = d.RequirementId AND r.IsDeleted = 0
               WHERE d.KeyDeliverableId = kd.KeyDeliverableId
               ORDER BY d.SortOrder, r.RequirementId
               FOR JSON PATH, INCLUDE_NULL_VALUES
           ) AS RequirementsJson,
           (
               SELECT dep.DependencyId            AS id,
                      dep.PredecessorId           AS predecessorId,
                      dep.DependencyType          AS [type],
                      dep.LagDays                 AS lagDays,
                      CAST(dep.RowVer AS BIGINT)  AS rowVer
               FROM app.KeyDeliverableDependency AS dep
               WHERE dep.SuccessorId = kd.KeyDeliverableId
                 AND dep.IsDeleted = 0
               ORDER BY dep.DependencyId
               FOR JSON PATH
           ) AS PredecessorsJson
    FROM app.Project AS p
    LEFT JOIN app.KeyDeliverable AS kd
        ON kd.ProjectId = p.ProjectId AND kd.IsDeleted = 0
    WHERE p.ProjectId = @ProjectId
      AND (kd.KeyDeliverableId IS NOT NULL OR @WithProjectRow = 1)
    ORDER BY kd.ParentKeyDeliverableId, kd.SortOrder, kd.KeyDeliverableId;
END;
GO
