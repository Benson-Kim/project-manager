-- usp_Requirement_Delete — soft-delete a requirement and remove every link to and from it and
-- every allocation (ADR-0037); renumber each deliverable that loses one.
-- Access: Manager + requirements:delete. CONFLICT 50002 on a stale RowVer.
-- BeforeJson keeps the links and allocations so the change can be read back. Answers with the
--   project id. Deliverables stay; only this requirement leaves the register.
-- A parent, meaning a row with sub-requirements or anything linked downstream (ADR-0060 section 8),
--   is refused under the project lock unless @ChildAction says what to do. 'Delete' also removes
--   ufn_Requirement_DeleteSet, one BeforeJson audit row each; @ExpectedDeleteCount is the count the
--   dialog showed, and a different count now is a conflict, so nothing goes unseen.
--   'Orphan' removes the links and moves the live children up one level, under this row's own parent (or
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
    @ChildAction     NVARCHAR(10) = N'None',
    @ExpectedDeleteCount INT = NULL
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

    IF @ChildAction IS NULL OR @ChildAction NOT IN (N'None', N'Orphan', N'Delete')
        THROW 50004, N'VALIDATION:Choose what happens to the items under this requirement', 1;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    IF @ChildAction = N'None'
       AND (EXISTS (SELECT 1 FROM app.Requirement
                    WHERE ParentRequirementId = @RequirementId AND IsDeleted = 0)
            OR EXISTS (SELECT 1 FROM app.RequirementTrace
                       WHERE ValidatesRequirementId = @RequirementId AND LinkStatus <> 'Retired'))
        THROW 50004, N'VALIDATION:Delete the sub-requirements and downstream links first, or choose what happens to them', 1;

    DECLARE @Doomed TABLE (RequirementId INT PRIMARY KEY);
    IF @ChildAction = N'Delete'
        INSERT INTO @Doomed (RequirementId)
        SELECT RequirementId FROM dbo.ufn_Requirement_DeleteSet(@RequirementId);
    ELSE
        INSERT INTO @Doomed (RequirementId) VALUES (@RequirementId);

    IF @ChildAction = N'Delete'
       AND ISNULL(@ExpectedDeleteCount, -1) <> (SELECT COUNT(*) FROM @Doomed)
        THROW 50002, N'CONFLICT:What this delete would remove has changed', 1;

    -- Read under the lock: every structure write takes it, so the parent cannot move meanwhile.
    DECLARE @ParentId INT, @RowType VARCHAR(3);
    SELECT @ParentId = ParentRequirementId, @RowType = RequirementType
    FROM app.Requirement WHERE RequirementId = @RequirementId;

    -- The deliverables that will lose an allocation; their lists are renumbered after the delete.
    DECLARE @Touched TABLE (KeyDeliverableId INT PRIMARY KEY);
    INSERT INTO @Touched (KeyDeliverableId)
    SELECT DISTINCT a.KeyDeliverableId
    FROM app.RequirementDeliverable AS a
    JOIN @Doomed AS d ON d.RequirementId = a.RequirementId;

    DECLARE @Before TABLE (RequirementId INT PRIMARY KEY, BeforeJson NVARCHAR(MAX) NOT NULL);
    INSERT INTO @Before (RequirementId, BeforeJson)
    SELECT d.RequirementId,
           (SELECT r.RequirementId, r.ProjectId, r.RequirementType, r.Number, r.ParentRequirementId,
                   r.Requirement, r.IsMet,
                   l.ValidatesJson, l.ValidatedByJson, l.DeliverablesJson
            FROM app.Requirement AS r
            OUTER APPLY dbo.ufn_Requirement_Links(r.RequirementId) AS l
            WHERE r.RequirementId = d.RequirementId
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM @Doomed AS d;

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

    UPDATE r SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    FROM app.Requirement AS r
    JOIN @Doomed AS d ON d.RequirementId = r.RequirementId
    WHERE r.RequirementId <> @RequirementId AND r.IsDeleted = 0;

    IF @ChildAction = N'Orphan'
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

    DELETE t FROM app.RequirementTrace AS t
    WHERE EXISTS (SELECT 1 FROM @Doomed AS d
                  WHERE d.RequirementId IN (t.RequirementId, t.ValidatesRequirementId));

    DELETE a FROM app.RequirementDeliverable AS a
    JOIN @Doomed AS d ON d.RequirementId = a.RequirementId;

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
    SELECT @ActorUserId, N'Delete', N'app.Requirement',
           CAST(b.RequirementId AS NVARCHAR(64)), b.BeforeJson
    FROM @Before AS b;

    COMMIT;

    SELECT @RowProjectId AS ProjectId;
END;
GO
