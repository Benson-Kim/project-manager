-- usp_Requirement_Delete — soft-delete one requirement and remove every link to and from it and
-- every allocation (ADR-0037); renumber each deliverable that loses one.
-- Access: Manager + requirements:delete. CONFLICT 50002 on a stale RowVer.
-- BeforeJson keeps the links and allocations so the change can be read back. Answers with the
--   project id. Deliverables stay; only this requirement leaves the register.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_Delete
    @RequirementId INT,
    @RowVer        BIGINT,
    @ActorUserId   INT
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

    -- The deliverables that will lose an allocation; their lists are renumbered after the delete.
    DECLARE @Touched TABLE (KeyDeliverableId INT PRIMARY KEY);
    INSERT INTO @Touched (KeyDeliverableId)
    SELECT KeyDeliverableId FROM app.RequirementDeliverable WHERE RequirementId = @RequirementId;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT r.RequirementId, r.ProjectId, r.RequirementType, r.Number, r.Requirement, r.IsMet,
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
