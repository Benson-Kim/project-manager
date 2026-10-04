-- usp_KeyDeliverable_GanttData — data for the Gantt view built from deliverable
-- dates (checklist row 67, module #9). Returns each active deliverable of a
-- project with its deadline, assignee display names and the project window
-- (StartDate/EndDate) as the chart range basis. RequestedDate and Deadline
-- are both returned; the bar start logic in the repository uses RequestedDate
-- when present, falling back to CreatedAtUtc.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_GanttData
    @ProjectId   INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    SELECT kd.KeyDeliverableId,
           kd.ProjectId,
           kd.[KeyRequirement],
           kd.[RequestedDate],
           kd.[Deadline],
           kd.[Priority],
           kd.[Status],
           kd.CreatedAtUtc,
           p.[StartDate] AS ProjectStartDate,
           p.[EndDate]   AS ProjectEndDate,
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
    FROM app.KeyDeliverable AS kd
    JOIN app.Project AS p
        ON p.ProjectId = kd.ProjectId
    WHERE kd.IsDeleted = 0
      AND kd.ProjectId = @ProjectId
    ORDER BY kd.[Deadline] ASC, kd.KeyDeliverableId ASC;
END;
GO
