-- usp_KeyDeliverable_GetById — fetch one active app.KeyDeliverable row with assignees;
-- THROW 50001 when absent/soft-deleted.
-- Actor project-scope: @ActorUserId must be an assignee of the owning project (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_GetById
    @KeyDeliverableId INT,
    @ActorUserId      INT,
    @ActorRole        NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    -- Actor project-scope: the actor must be assigned to the owning project. Admins bypass.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.KeyDeliverable kd
           JOIN app.ProjectAssignee pa ON pa.ProjectId = kd.ProjectId AND pa.UserId = @ActorUserId
                                      AND pa.IsDeleted = 0
           WHERE kd.KeyDeliverableId = @KeyDeliverableId AND kd.IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    SELECT kd.KeyDeliverableId,
           kd.[ProjectId],
           kd.[KeyRequirement],
           kd.[RequestedDate],
           kd.[Deadline],
           kd.[Priority],
           kd.[Status],
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
           ) AS AssigneesJson
    FROM app.KeyDeliverable AS kd
    WHERE kd.KeyDeliverableId = @KeyDeliverableId AND kd.IsDeleted = 0;
END;
GO
