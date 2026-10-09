-- usp_KeyDeliverable_Update — full-row update with rowversion concurrency (50002 CONFLICT),
-- replaces assignee set atomically, in-transaction audit (includes assignee delta).
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass). The project key is immutable:
--   @ProjectId is accepted but ignored (DB standard).
-- Priority and Status must be live options of their lists, or unchanged (ADR-0022, VALIDATION 50004).
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Update
    @KeyDeliverableId INT,
    @ProjectId        INT           = NULL,
    @KeyRequirement   NVARCHAR(MAX) = NULL,
    @RequestedDate    DATETIME2     = NULL,
    @Deadline         DATETIME2     = NULL,
    @AssigneeIds      NVARCHAR(MAX) = NULL,   -- JSON array e.g. '[1,2,3]' or NULL = clear all
    @Priority         NVARCHAR(255) = NULL,
    @Status           NVARCHAR(255) = NULL,
    @RowVer           BIGINT,
    @ActorUserId      INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT,
            @CurrentPriority NVARCHAR(255), @CurrentStatus NVARCHAR(255);
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId,
           @CurrentPriority = [Priority], @CurrentStatus = [Status]
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;
    SET @ProjectId = @RowProjectId;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'key-deliverable.priority', @Label = @Priority OUTPUT,
         @CurrentLabel = @CurrentPriority;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'key-deliverable.status', @Label = @Status OUTPUT,
         @CurrentLabel = @CurrentStatus;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [RequestedDate], [Deadline], [Priority], [Status],
                (SELECT CAST(a.StakeholderId AS NVARCHAR(20)) AS id
                 FROM app.KeyDeliverableAssignee AS a
                 WHERE a.KeyDeliverableId = @KeyDeliverableId
                 FOR JSON PATH) AS Assignees
         FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.KeyDeliverable SET
        [ProjectId]     = @ProjectId,
        [KeyRequirement] = @KeyRequirement,
        [RequestedDate] = @RequestedDate,
        [Deadline]      = @Deadline,
        [Priority]      = @Priority,
        [Status]        = @Status,
        UpdatedAtUtc    = SYSUTCDATETIME(),
        UpdatedBy       = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;

    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    -- Replace assignee set atomically: delete old rows, insert validated new ones.
    DELETE FROM app.KeyDeliverableAssignee
    WHERE KeyDeliverableId = @KeyDeliverableId;

    IF @AssigneeIds IS NOT NULL AND LEN(@AssigneeIds) > 2
    BEGIN
        -- Only insert assignees whose active stakeholder belongs to @ProjectId,
        -- preventing cross-project stakeholder injection.
        INSERT INTO app.KeyDeliverableAssignee (KeyDeliverableId, StakeholderId, CreatedBy)
        SELECT @KeyDeliverableId, CAST(j.[value] AS INT), @ActorUserId
        FROM OPENJSON(@AssigneeIds) AS j
        WHERE TRY_CAST(j.[value] AS INT) IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM app.Stakeholder AS s
              WHERE s.StakeholderId = CAST(j.[value] AS INT)
                AND s.ProjectId     = @ProjectId
                AND s.IsDeleted     = 0
          );
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)), @Before,
            (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [RequestedDate], [Deadline], [Priority], [Status],
                    (SELECT CAST(a.StakeholderId AS NVARCHAR(20)) AS id
                     FROM app.KeyDeliverableAssignee AS a
                     WHERE a.KeyDeliverableId = @KeyDeliverableId
                     FOR JSON PATH) AS Assignees
             FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
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
    WHERE kd.KeyDeliverableId = @KeyDeliverableId;
END;
GO
