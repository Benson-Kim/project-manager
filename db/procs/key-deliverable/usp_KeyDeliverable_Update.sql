-- usp_KeyDeliverable_Update — full-row update with rowversion concurrency (50002 CONFLICT),
-- replaces assignee set atomically, in-transaction audit.
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
        (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [RequestedDate], [Deadline], [Priority], [Status]
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
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;

    -- Replace assignee set atomically: delete old rows, insert new ones
    DELETE FROM app.KeyDeliverableAssignee
    WHERE KeyDeliverableId = @KeyDeliverableId;

    IF @AssigneeIds IS NOT NULL AND LEN(@AssigneeIds) > 2
    BEGIN
        INSERT INTO app.KeyDeliverableAssignee (KeyDeliverableId, StakeholderId, CreatedBy)
        SELECT @KeyDeliverableId, CAST(j.[value] AS INT), @ActorUserId
        FROM OPENJSON(@AssigneeIds) AS j
        WHERE ISNUMERIC(j.[value]) = 1;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)), @Before,
            (SELECT KeyDeliverableId, [ProjectId], [KeyRequirement], [RequestedDate], [Deadline], [Priority], [Status]
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
                   LTRIM(RTRIM(CONCAT(ISNULL(s.FirstName,''), N' ', ISNULL(s.LastName,'')))),
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
    WHERE kd.KeyDeliverableId = @KeyDeliverableId;
END;
GO
