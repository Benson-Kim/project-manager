-- usp_ResponsibilityAssignment_Set — sets (or with a NULL @RoleCode clears) one cell: a row of the matrix x one
--   stakeholder column. Concurrency is compare-and-set on the cell's role: @ExpectedRoleCode is what the client saw
--   (NULL = empty), and a different current role is CONFLICT 50002. On WbsItem rows the framework's assignee role
--   is never stored: it is app.KeyDeliverableAssignee, kept in step here, and any change to it bumps the
--   KeyDeliverable RowVer and is audited on the deliverable too. A one-per-row role held by someone else in the row
--   is CONFLICT 50002 unless @MoveSingle = 1, which takes it from them. Matrix, row or member NOT_FOUND 50001; a row
--   of the wrong kind or a role of another framework VALIDATION 50004; Manager with stakeholders:update, plus
--   key-deliverables:update when the assignees change (FORBIDDEN_ROW 50003). The matrix row is locked first, so all
--   cell writes of one matrix run one at a time. Returns RoleCode and KeyDeliverableRowVer (NULL on decision rows).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ResponsibilityAssignment_Set
    @ProjectId INT,
    @ResponsibilityMatrixId INT,
    @KeyDeliverableId INT = NULL,
    @DecisionId INT = NULL,
    @StakeholderId INT,
    @RoleCode NVARCHAR(40) = NULL,
    @ExpectedRoleCode NVARCHAR(40) = NULL,
    @MoveSingle BIT = 0,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'stakeholders:update', @AllowProjectless = 0;

    DECLARE @FrameworkCode NVARCHAR(40), @RowKind NVARCHAR(40);
    SELECT @FrameworkCode = FrameworkCode, @RowKind = RowKind
    FROM app.ResponsibilityMatrix
    WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND ProjectId = @ProjectId AND IsDeleted = 0;
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:Matrix not found', 1;

    IF (@RowKind = N'WbsItem' AND (@KeyDeliverableId IS NULL OR @DecisionId IS NOT NULL))
       OR (@RowKind = N'Decision' AND (@DecisionId IS NULL OR @KeyDeliverableId IS NOT NULL))
        THROW 50004, N'VALIDATION:Row does not match the rows of this matrix', 1;

    IF @RowKind = N'WbsItem' AND NOT EXISTS (SELECT 1 FROM app.KeyDeliverable
        WHERE KeyDeliverableId = @KeyDeliverableId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Deliverable not found', 1;
    IF @RowKind = N'Decision' AND NOT EXISTS (SELECT 1 FROM app.Decision
        WHERE DecisionId = @DecisionId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Decision not found', 1;

    DECLARE @OnePerRow BIT = 0, @AssigneeRole NVARCHAR(40);
    IF @RoleCode IS NOT NULL
    BEGIN
        SELECT @OnePerRow = OnePerRow FROM app.ResponsibilityRole
        WHERE FrameworkCode = @FrameworkCode AND RoleCode = @RoleCode;
        IF @@ROWCOUNT = 0
            THROW 50004, N'VALIDATION:Role does not belong to this framework', 1;
    END;
    IF @RowKind = N'WbsItem'
        SELECT @AssigneeRole = RoleCode FROM app.ResponsibilityRole
        WHERE FrameworkCode = @FrameworkCode AND IsAssigneeRole = 1;


    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMatrix WITH (UPDLOCK, ROWLOCK)
                   WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Matrix not found', 1;
    IF @RowKind = N'WbsItem' AND NOT EXISTS (SELECT 1 FROM app.KeyDeliverable WITH (UPDLOCK, ROWLOCK)
                   WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Deliverable not found', 1;
    IF NOT EXISTS (SELECT 1 FROM app.ResponsibilityMember mb
                   JOIN app.Stakeholder s ON s.StakeholderId = mb.StakeholderId AND s.IsDeleted = 0
                   WHERE mb.ResponsibilityMatrixId = @ResponsibilityMatrixId AND mb.StakeholderId = @StakeholderId)
        THROW 50001, N'NOT_FOUND:Stakeholder is not in this matrix', 1;

    DECLARE @Current NVARCHAR(40) =
        (SELECT RoleCode FROM app.ResponsibilityAssignment
         WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId
           AND (KeyDeliverableId = @KeyDeliverableId OR DecisionId = @DecisionId));
    DECLARE @HasKda BIT = 0;
    IF @AssigneeRole IS NOT NULL AND EXISTS (SELECT 1 FROM app.KeyDeliverableAssignee
        WHERE KeyDeliverableId = @KeyDeliverableId AND StakeholderId = @StakeholderId)
        SET @HasKda = 1;
    IF @Current IS NULL AND @HasKda = 1
        SET @Current = @AssigneeRole;

    IF ISNULL(@Current, N'') <> ISNULL(@ExpectedRoleCode, N'')
        THROW 50002, N'CONFLICT:This cell was changed by someone else', 1;

    IF ISNULL(@Current, N'') = ISNULL(@RoleCode, N'')
    BEGIN
        COMMIT;
        SELECT @RoleCode AS RoleCode,
               (SELECT CAST(RowVer AS BIGINT) FROM app.KeyDeliverable
                WHERE KeyDeliverableId = @KeyDeliverableId) AS KeyDeliverableRowVer;
        RETURN;
    END;

    DECLARE @KdaBefore NVARCHAR(MAX) =
        (SELECT CAST(k.StakeholderId AS NVARCHAR(20)) AS id FROM app.KeyDeliverableAssignee k
         WHERE k.KeyDeliverableId = @KeyDeliverableId ORDER BY k.StakeholderId FOR JSON PATH);
    DECLARE @Before NVARCHAR(MAX) =
        (SELECT c.StakeholderId, c.RoleCode FROM (
            SELECT a.StakeholderId, a.RoleCode FROM app.ResponsibilityAssignment a
            WHERE a.ResponsibilityMatrixId = @ResponsibilityMatrixId
              AND (a.KeyDeliverableId = @KeyDeliverableId OR a.DecisionId = @DecisionId)
            UNION ALL
            SELECT k.StakeholderId, @AssigneeRole FROM app.KeyDeliverableAssignee k
            WHERE @AssigneeRole IS NOT NULL AND k.KeyDeliverableId = @KeyDeliverableId) c
         ORDER BY c.StakeholderId FOR JSON PATH);

    IF @OnePerRow = 1
    BEGIN
        DECLARE @Others INT =
            (SELECT COUNT(*) FROM app.ResponsibilityAssignment WITH (UPDLOCK, HOLDLOCK)
             WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND RoleCode = @RoleCode
               AND StakeholderId <> @StakeholderId
               AND (KeyDeliverableId = @KeyDeliverableId OR DecisionId = @DecisionId));
        IF @RoleCode = @AssigneeRole
            SET @Others += (SELECT COUNT(*) FROM app.KeyDeliverableAssignee WITH (UPDLOCK, HOLDLOCK)
                            WHERE KeyDeliverableId = @KeyDeliverableId AND StakeholderId <> @StakeholderId);
        IF @Others > 0 AND @MoveSingle = 0
            THROW 50002, N'CONFLICT:Only one person can hold this role in a row', 1;
        IF @Others > 0
        BEGIN
            DELETE FROM app.ResponsibilityAssignment
            WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND RoleCode = @RoleCode
              AND StakeholderId <> @StakeholderId
              AND (KeyDeliverableId = @KeyDeliverableId OR DecisionId = @DecisionId);
            IF @RoleCode = @AssigneeRole
                DELETE FROM app.KeyDeliverableAssignee
                WHERE KeyDeliverableId = @KeyDeliverableId AND StakeholderId <> @StakeholderId;
        END;
    END;

    IF @RoleCode = @AssigneeRole
    BEGIN
        DELETE FROM app.ResponsibilityAssignment
        WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND KeyDeliverableId = @KeyDeliverableId
          AND StakeholderId = @StakeholderId;
        IF @HasKda = 0
            INSERT INTO app.KeyDeliverableAssignee (KeyDeliverableId, StakeholderId, CreatedAtUtc, CreatedBy)
            VALUES (@KeyDeliverableId, @StakeholderId, SYSUTCDATETIME(), @ActorUserId);
    END
    ELSE
    BEGIN
        IF @HasKda = 1
            DELETE FROM app.KeyDeliverableAssignee
            WHERE KeyDeliverableId = @KeyDeliverableId AND StakeholderId = @StakeholderId;
        IF @RoleCode IS NULL
            DELETE FROM app.ResponsibilityAssignment
            WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId
              AND (KeyDeliverableId = @KeyDeliverableId OR DecisionId = @DecisionId);
        ELSE
        BEGIN
            UPDATE app.ResponsibilityAssignment
            SET RoleCode = @RoleCode, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
            WHERE ResponsibilityMatrixId = @ResponsibilityMatrixId AND StakeholderId = @StakeholderId
              AND (KeyDeliverableId = @KeyDeliverableId OR DecisionId = @DecisionId);
            IF @@ROWCOUNT = 0
                INSERT INTO app.ResponsibilityAssignment (ResponsibilityMatrixId, ProjectId, FrameworkCode, RowKind,
                    KeyDeliverableId, DecisionId, StakeholderId, RoleCode, CreatedAtUtc, CreatedBy, UpdatedAtUtc, UpdatedBy)
                VALUES (@ResponsibilityMatrixId, @ProjectId, @FrameworkCode, @RowKind, @KeyDeliverableId, @DecisionId,
                        @StakeholderId, @RoleCode, SYSUTCDATETIME(), @ActorUserId, SYSUTCDATETIME(), @ActorUserId);
        END;
    END;

    IF @RowKind = N'WbsItem'
    BEGIN
        DECLARE @KdaAfter NVARCHAR(MAX) =
            (SELECT CAST(k.StakeholderId AS NVARCHAR(20)) AS id FROM app.KeyDeliverableAssignee k
             WHERE k.KeyDeliverableId = @KeyDeliverableId ORDER BY k.StakeholderId FOR JSON PATH);
        IF ISNULL(@KdaAfter, N'') <> ISNULL(@KdaBefore, N'')
        BEGIN
            EXEC dbo.usp_Project_AssertAccess
                 @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                 @MinLevel = N'Manager', @Permission = N'key-deliverables:update', @AllowProjectless = 0;

            UPDATE app.KeyDeliverable SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
            WHERE KeyDeliverableId = @KeyDeliverableId;

            INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
            VALUES (@ActorUserId, N'Update', N'app.KeyDeliverable', CAST(@KeyDeliverableId AS NVARCHAR(20)),
                    (SELECT @KeyDeliverableId AS KeyDeliverableId, @ProjectId AS ProjectId,
                            JSON_QUERY(ISNULL(@KdaBefore, N'[]')) AS Assignees FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                    (SELECT @KeyDeliverableId AS KeyDeliverableId, @ProjectId AS ProjectId,
                            JSON_QUERY(ISNULL(@KdaAfter, N'[]')) AS Assignees FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;
    END;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ResponsibilityAssignment',
            CASE WHEN @KeyDeliverableId IS NOT NULL THEN CONCAT(@ResponsibilityMatrixId, N':kd', @KeyDeliverableId)
                 ELSE CONCAT(@ResponsibilityMatrixId, N':dec', @DecisionId) END,
            @Before,
            (SELECT c.StakeholderId, c.RoleCode FROM (
                SELECT a.StakeholderId, a.RoleCode FROM app.ResponsibilityAssignment a
                WHERE a.ResponsibilityMatrixId = @ResponsibilityMatrixId
                  AND (a.KeyDeliverableId = @KeyDeliverableId OR a.DecisionId = @DecisionId)
                UNION ALL
                SELECT k.StakeholderId, @AssigneeRole FROM app.KeyDeliverableAssignee k
                WHERE @AssigneeRole IS NOT NULL AND k.KeyDeliverableId = @KeyDeliverableId) c
             ORDER BY c.StakeholderId FOR JSON PATH));

    COMMIT;

    SELECT @RoleCode AS RoleCode,
           (SELECT CAST(RowVer AS BIGINT) FROM app.KeyDeliverable
            WHERE KeyDeliverableId = @KeyDeliverableId) AS KeyDeliverableRowVer;
END
GO
