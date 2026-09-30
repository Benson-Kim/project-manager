-- usp_KeyDeliverable_Create — insert one app.KeyDeliverable row + assignees;
-- audits in-transaction; returns the new row with comma-separated assignee names.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Create
    @ProjectId        INT           = NULL,
    @KeyRequirement   NVARCHAR(MAX) = NULL,
    @RequestedDate    DATETIME2     = NULL,
    @Deadline         DATETIME2     = NULL,
    @AssigneeIds      NVARCHAR(MAX) = NULL,   -- JSON array e.g. '[1,2,3]' or NULL
    @Priority         NVARCHAR(255) = NULL,
    @Status           NVARCHAR(255) = NULL,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    INSERT INTO app.KeyDeliverable
        ([ProjectId], [KeyRequirement], [RequestedDate], [Deadline], [Priority], [Status], CreatedBy)
    VALUES
        (@ProjectId, @KeyRequirement, @RequestedDate, @Deadline, @Priority, @Status, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    -- Insert assignees validated to belong to @ProjectId (prevents cross-project injection).
    IF @AssigneeIds IS NOT NULL AND LEN(@AssigneeIds) > 2
    BEGIN
        INSERT INTO app.KeyDeliverableAssignee (KeyDeliverableId, StakeholderId, CreatedBy)
        SELECT @Id, CAST(j.[value] AS INT), @ActorUserId
        FROM OPENJSON(@AssigneeIds) AS j
        WHERE ISNUMERIC(j.[value]) = 1
          AND EXISTS (
              SELECT 1 FROM app.Stakeholder AS s
              WHERE s.StakeholderId = CAST(j.[value] AS INT)
                AND s.ProjectId     = @ProjectId
                AND s.IsDeleted     = 0
          )
          AND NOT EXISTS (
              SELECT 1 FROM app.KeyDeliverableAssignee
              WHERE KeyDeliverableId = @Id AND StakeholderId = CAST(j.[value] AS INT)
          );
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.KeyDeliverable', CAST(@Id AS NVARCHAR(64)),
            (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [RequestedDate], [Deadline], [Priority], [Status]
             FROM app.KeyDeliverable WHERE KeyDeliverableId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

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
               )
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
    WHERE kd.KeyDeliverableId = @Id;
END;
GO
