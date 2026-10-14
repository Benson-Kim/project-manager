-- usp_KeyDeliverable_Move — put an item, with its sub-items, at @Position (from 1; NULL or past the
-- end = last) among the children of @ParentKeyDeliverableId (NULL = top level). This is how the
-- work breakdown indents, outdents and moves items up or down (ADR-0027).
-- Row-level access: the row's project must be accessible (dbo.usp_Project_AssertAccess,
--   FORBIDDEN_ROW 50003; Admin bypass); rowversion concurrency on the moved item (50002 CONFLICT).
-- The project row is locked before the placement is checked (usp_KeyDeliverable_AssertPlacement:
--   same project, no cycle, at most 10 levels), so two concurrent moves cannot build a cycle.
--   Both sibling lists are renumbered from 1; dates are rolled up for the old and new parents.
-- Returns the item's ProjectId. Entity app.KeyDeliverable. Module: key-deliverables (#9).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_Move
    @KeyDeliverableId       INT,
    @ParentKeyDeliverableId INT    = NULL,
    @Position               INT    = NULL,
    @RowVer                 BIGINT,
    @ActorUserId            INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    EXEC dbo.usp_KeyDeliverable_AssertPlacement
         @ProjectId = @RowProjectId, @ParentKeyDeliverableId = @ParentKeyDeliverableId,
         @KeyDeliverableId = @KeyDeliverableId;

    DECLARE @OldParent INT, @Before NVARCHAR(MAX);
    SELECT @OldParent = ParentKeyDeliverableId,
           @Before = (SELECT ParentKeyDeliverableId, SortOrder FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId;

    DECLARE @Count INT =
        (SELECT COUNT(*) FROM app.KeyDeliverable
         WHERE ProjectId = @RowProjectId AND IsDeleted = 0 AND KeyDeliverableId <> @KeyDeliverableId
           AND (ParentKeyDeliverableId = @ParentKeyDeliverableId
                OR (ParentKeyDeliverableId IS NULL AND @ParentKeyDeliverableId IS NULL)));
    IF @Position IS NULL OR @Position > @Count + 1 SET @Position = @Count + 1;
    IF @Position < 1 SET @Position = 1;

    WITH siblings AS (
        SELECT SortOrder, ROW_NUMBER() OVER (ORDER BY SortOrder, KeyDeliverableId) AS Rn
        FROM app.KeyDeliverable
        WHERE ProjectId = @RowProjectId AND IsDeleted = 0 AND KeyDeliverableId <> @KeyDeliverableId
          AND (ParentKeyDeliverableId = @ParentKeyDeliverableId
               OR (ParentKeyDeliverableId IS NULL AND @ParentKeyDeliverableId IS NULL))
    )
    UPDATE siblings SET SortOrder = CASE WHEN Rn >= @Position THEN Rn + 1 ELSE Rn END
    WHERE SortOrder <> CASE WHEN Rn >= @Position THEN Rn + 1 ELSE Rn END;

    UPDATE app.KeyDeliverable SET
        ParentKeyDeliverableId = @ParentKeyDeliverableId,
        SortOrder              = @Position,
        UpdatedAtUtc           = SYSUTCDATETIME(),
        UpdatedBy              = @ActorUserId
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:KeyDeliverable was modified by someone else', 1;

    IF NOT (@OldParent = @ParentKeyDeliverableId OR (@OldParent IS NULL AND @ParentKeyDeliverableId IS NULL))
    BEGIN
        WITH former AS (
            SELECT SortOrder, ROW_NUMBER() OVER (ORDER BY SortOrder, KeyDeliverableId) AS Rn
            FROM app.KeyDeliverable
            WHERE ProjectId = @RowProjectId AND IsDeleted = 0
              AND (ParentKeyDeliverableId = @OldParent
                   OR (ParentKeyDeliverableId IS NULL AND @OldParent IS NULL))
        )
        UPDATE former SET SortOrder = Rn WHERE SortOrder <> Rn;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Move', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(64)), @Before,
            (SELECT ParentKeyDeliverableId, SortOrder
             FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    EXEC dbo.usp_KeyDeliverable_RollUp
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId, @FromKeyDeliverableId = @KeyDeliverableId;
    IF @OldParent IS NOT NULL AND @OldParent <> ISNULL(@ParentKeyDeliverableId, 0)
        EXEC dbo.usp_KeyDeliverable_RollUp
             @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId, @FromKeyDeliverableId = @OldParent;

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
