-- usp_KeyDeliverable_Update — full-row update with rowversion concurrency (50002 CONFLICT),
-- replaces assignee set atomically, in-transaction audit (includes assignee delta).
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

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.KeyDeliverable
         WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

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
