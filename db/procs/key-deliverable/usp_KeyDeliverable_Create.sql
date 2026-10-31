-- usp_KeyDeliverable_Create — insert one app.KeyDeliverable row + assignees;
-- audits in-transaction; returns the new row with comma-separated assignee names.
-- Row-level access: the target @ProjectId must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass).
-- Priority and Status must be live options of 'key-deliverable.priority' / 'key-deliverable.status'
--   (ADR-0022, VALIDATION 50004) and are stored as listed.
-- Work breakdown (ADR-0027): the item goes under @ParentKeyDeliverableId (NULL = top level), right
--   after the sibling @AfterKeyDeliverableId, or last. usp_KeyDeliverable_AssertPlacement checks the
--   parent; the project row is locked first so concurrent structure changes queue up. The new item
--   has no sub-items, so its own dates stand; its parents' dates are rolled up.
--   @StartDate is required by the app; when it is missing (a caller from before migration 032)
--   it defaults to where that version started the bar: RequestedDate, else today, never after
--   the deadline. @Color is a palette key or NULL (take the parent's colour).
--   @IsMilestone = 1 creates a date rather than a span (ADR-0046): both ends must already be the
--   same day, so a caller from before migration 043 (which never sends it) is unaffected.
--   @Budget (ADR-0052) is optional and >= 0; a new item has no sub-items, so its own budget stands.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Create
    @ProjectId              INT           = NULL,
    @KeyRequirement         NVARCHAR(MAX) = NULL,
    @RequestedDate          DATETIME2     = NULL,
    @StartDate              DATETIME2     = NULL,
    @Deadline               DATETIME2     = NULL,
    @AssigneeIds            NVARCHAR(MAX) = NULL,   -- JSON array e.g. '[1,2,3]' or NULL
    @Priority               NVARCHAR(255) = NULL,
    @Status                 NVARCHAR(255) = NULL,
    @Color                  VARCHAR(10)   = NULL,
    @ParentKeyDeliverableId INT           = NULL,
    @AfterKeyDeliverableId  INT           = NULL,
    @IsMilestone            BIT           = 0,
    @Budget                 DECIMAL(19, 2) = NULL,
    @ActorUserId            INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:create', @AllowProjectless = 0;

    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'key-deliverable.priority', @Label = @Priority OUTPUT;
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'key-deliverable.status', @Label = @Status OUTPUT;

    IF @Deadline < @RequestedDate
        THROW 50004, N'VALIDATION:Deadline cannot be before RequestedDate', 1;

    IF @StartDate IS NULL
    BEGIN
        SET @StartDate = ISNULL(@RequestedDate, CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME2));
        IF @StartDate > @Deadline SET @StartDate = @Deadline;
    END;

    IF @Deadline < @StartDate
        THROW 50004, N'VALIDATION:Deadline cannot be before StartDate', 1;

    -- A milestone is created as the date it already is; this proc never reinterprets the caller's
    -- dates into one, so a span sent with @IsMilestone = 1 is a mistake worth reporting.
    IF @IsMilestone = 1
       AND (@StartDate IS NULL OR @Deadline IS NULL
            OR CAST(@Deadline AS DATE) <> CAST(@StartDate AS DATE))
        THROW 50004, N'VALIDATION:A milestone spans one day', 1;

    IF @Color IS NOT NULL AND @Color NOT IN ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray')
        THROW 50004, N'VALIDATION:Unknown colour', 1;

    IF @Budget < 0
        THROW 50004, N'VALIDATION:A budget cannot be negative', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;

    EXEC dbo.usp_KeyDeliverable_AssertPlacement
         @ProjectId = @ProjectId, @ParentKeyDeliverableId = @ParentKeyDeliverableId;

    DECLARE @SortOrder INT;
    IF @AfterKeyDeliverableId IS NOT NULL
    BEGIN
        SELECT @SortOrder = SortOrder + 1
        FROM app.KeyDeliverable
        WHERE KeyDeliverableId = @AfterKeyDeliverableId AND ProjectId = @ProjectId AND IsDeleted = 0
          AND (ParentKeyDeliverableId = @ParentKeyDeliverableId
               OR (ParentKeyDeliverableId IS NULL AND @ParentKeyDeliverableId IS NULL));
        IF @SortOrder IS NULL
            THROW 50004, N'VALIDATION:The item to insert after is not a sibling', 1;

        UPDATE app.KeyDeliverable SET SortOrder = SortOrder + 1
        WHERE ProjectId = @ProjectId AND IsDeleted = 0 AND SortOrder >= @SortOrder
          AND (ParentKeyDeliverableId = @ParentKeyDeliverableId
               OR (ParentKeyDeliverableId IS NULL AND @ParentKeyDeliverableId IS NULL));
    END
    ELSE
        SELECT @SortOrder = ISNULL(MAX(SortOrder), 0) + 1
        FROM app.KeyDeliverable
        WHERE ProjectId = @ProjectId AND IsDeleted = 0
          AND (ParentKeyDeliverableId = @ParentKeyDeliverableId
               OR (ParentKeyDeliverableId IS NULL AND @ParentKeyDeliverableId IS NULL));

    INSERT INTO app.KeyDeliverable
        ([ProjectId], ParentKeyDeliverableId, SortOrder, [KeyRequirement], [RequestedDate], StartDate,
         [Deadline], [Priority], [Status], Color, [IsMilestone], Budget, CreatedBy)
    VALUES
        (@ProjectId, @ParentKeyDeliverableId, @SortOrder, @KeyRequirement, @RequestedDate, @StartDate,
         @Deadline, @Priority, @Status, @Color, @IsMilestone, @Budget, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    -- Insert assignees validated to belong to @ProjectId (prevents cross-project injection).
    IF @AssigneeIds IS NOT NULL AND LEN(@AssigneeIds) > 2
    BEGIN
        INSERT INTO app.KeyDeliverableAssignee (KeyDeliverableId, StakeholderId, CreatedBy)
        -- DISTINCT, not NOT EXISTS: the subquery reads the table as of statement start, so it
        -- never saw a repeat inside one payload, and @Id is a fresh identity it could never match.
        SELECT DISTINCT @Id, CAST(j.[value] AS INT), @ActorUserId
        FROM OPENJSON(@AssigneeIds) AS j
        WHERE TRY_CAST(j.[value] AS INT) IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM app.Stakeholder AS s
              WHERE s.StakeholderId = CAST(j.[value] AS INT)
                AND s.ProjectId     = @ProjectId
                AND s.IsDeleted     = 0
          );
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.KeyDeliverable', CAST(@Id AS NVARCHAR(64)),
            (SELECT KeyDeliverableId, [ProjectId], ParentKeyDeliverableId, SortOrder, [KeyRequirement],
                    [RequestedDate], StartDate, [Deadline], [Priority], [Status], Color, [IsMilestone],
                    Budget,
                    (SELECT CAST(a.StakeholderId AS NVARCHAR(20)) AS id
                     FROM app.KeyDeliverableAssignee AS a
                     WHERE a.KeyDeliverableId = @Id
                     FOR JSON PATH) AS Assignees
             FROM app.KeyDeliverable WHERE KeyDeliverableId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    EXEC dbo.usp_KeyDeliverable_RollUp
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @FromKeyDeliverableId = @Id;

    EXEC dbo.usp_KeyDeliverable_CascadeDependencies
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId;

    COMMIT;

    SELECT kd.KeyDeliverableId,
           kd.[ProjectId],
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
           kd.Budget,
           kd.Note,
           CAST(0 AS BIT) AS HasChildren,
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
    WHERE kd.KeyDeliverableId = @Id;
END;
GO
