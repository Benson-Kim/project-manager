-- usp_Requirement_Delete — soft-delete one requirement and remove every link to and from it and
-- every allocation (ADR-0037); renumber each deliverable that loses one.
-- Access: Manager + requirements:delete. CONFLICT 50002 on a stale RowVer.
-- BeforeJson keeps the links and allocations so the change can be read back. Answers with the
--   project id. Deliverables stay; only this requirement leaves the register.
-- A requirement that still has sub-requirements is refused (ADR-0048), under the project lock
--   since it reads other rows, unless @PromoteChildren = 1. That is the client's choice: refuse by
--   default, and on request move the live children up one level, under this row's own parent (or
--   to the top level), numbered after the numbers already used there, deleted ones counted, in
--   their old order. Their own sub-requirements travel with them, so every reference below changes;
--   the UI says so before asking. The new parent is an ancestor of each child, so the move cannot
--   form a cycle, and the depth only shrinks. Each move is audited as an Update of that child.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_Delete
    @RequirementId   INT,
    @RowVer          BIGINT,
    @ActorUserId     INT,
    @PromoteChildren BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'requirements:delete', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF ISNULL(@PromoteChildren, 0) = 0
       AND EXISTS (SELECT 1 FROM app.Requirement
                   WHERE ParentRequirementId = @RequirementId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:Delete the sub-requirements under this one first, or move them up a level', 1;

    -- Read under the lock: every structure write takes it, so the parent cannot move meanwhile.
    DECLARE @ParentId INT, @RowType VARCHAR(3);
    SELECT @ParentId = ParentRequirementId, @RowType = RequirementType
    FROM app.Requirement WHERE RequirementId = @RequirementId;

    -- The deliverables that will lose an allocation; their lists are renumbered after the delete.
    DECLARE @Touched TABLE (KeyDeliverableId INT PRIMARY KEY);
    INSERT INTO @Touched (KeyDeliverableId)
    SELECT KeyDeliverableId FROM app.RequirementDeliverable WHERE RequirementId = @RequirementId;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT r.RequirementId, r.ProjectId, r.RequirementType, r.Number, r.ParentRequirementId,
                r.Requirement, r.IsMet,
                l.ValidatesJson, l.ValidatedByJson, l.DeliverablesJson
         FROM app.Requirement AS r
         OUTER APPLY dbo.ufn_Requirement_Links(r.RequirementId) AS l
         WHERE r.RequirementId = @RequirementId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.Requirement SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE RequirementId = @RequirementId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Requirement not found', 1;
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;
    END

    IF @PromoteChildren = 1
    BEGIN
        DECLARE @Promoted TABLE (RequirementId INT PRIMARY KEY, OldNumber INT NOT NULL, NewNumber INT NOT NULL);
        DECLARE @LastNumber INT =
            ISNULL((SELECT MAX(Number) FROM app.Requirement
                    WHERE ProjectId = @RowProjectId AND RequirementType = @RowType
                      AND ((@ParentId IS NULL AND ParentRequirementId IS NULL)
                           OR ParentRequirementId = @ParentId)), 0);

        INSERT INTO @Promoted (RequirementId, OldNumber, NewNumber)
        SELECT RequirementId, Number, @LastNumber + ROW_NUMBER() OVER (ORDER BY Number, RequirementId)
        FROM app.Requirement
        WHERE ParentRequirementId = @RequirementId AND IsDeleted = 0;

        UPDATE r SET
            ParentRequirementId = @ParentId,
            Number              = p.NewNumber
        FROM app.Requirement AS r
        JOIN @Promoted AS p ON p.RequirementId = r.RequirementId;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        SELECT @ActorUserId, N'Update', N'app.Requirement', CAST(p.RequirementId AS NVARCHAR(64)),
               (SELECT @RequirementId AS ParentRequirementId, p.OldNumber AS Number
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
               (SELECT @ParentId AS ParentRequirementId, p.NewNumber AS Number
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES)
        FROM @Promoted AS p;
    END

    DELETE FROM app.RequirementTrace
    WHERE RequirementId = @RequirementId OR ValidatesRequirementId = @RequirementId;

    DELETE FROM app.RequirementDeliverable WHERE RequirementId = @RequirementId;

    UPDATE d SET
        SortOrder = o.Position
    FROM app.RequirementDeliverable AS d
    JOIN (SELECT a.RequirementId, a.KeyDeliverableId,
                 ROW_NUMBER() OVER (PARTITION BY a.KeyDeliverableId
                                    ORDER BY a.SortOrder, a.RequirementId) AS Position
          FROM app.RequirementDeliverable AS a
          JOIN @Touched AS t ON t.KeyDeliverableId = a.KeyDeliverableId) AS o
        ON o.RequirementId = d.RequirementId AND o.KeyDeliverableId = d.KeyDeliverableId
    WHERE d.SortOrder <> o.Position;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.Requirement',
            CAST(@RequirementId AS NVARCHAR(64)), @Before);

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
