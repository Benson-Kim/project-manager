-- usp_MeetingActionItem_SetLogLinks — sets which governance logs a meeting action item is logged in (080).
--   @Kinds is the full set, comma separated, from the registry in src/modules/meetings/governance-logs.ts.
--   A newly ticked log gets a new record made from the action; a ticked log whose record has not been edited in
--   its log since the minutes last wrote it is updated from the action; a record edited in its log is left alone.
--   An unticked log loses the link and keeps its record.
--   @Title is the action as plain text, made by the app; the action text becomes the record text and the
--   meeting start date its logged date.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingActionItem_SetLogLinks
    @MeetingActionItemId INT,
    @RowVer                   BIGINT,
    @Kinds                    NVARCHAR(400),
    @Title                    NVARCHAR(255),
    @ActorUserId              INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ItemId INT = @MeetingActionItemId;
    DECLARE @ProjectId INT, @MeetingId INT, @MeetingDate DATETIME2, @Text NVARCHAR(MAX);
    SELECT @ProjectId = m.ProjectId, @MeetingId = m.MeetingId, @MeetingDate = m.StartDate, @Text = ai.[Action]
    FROM app.MeetingActionItem AS ai
    JOIN app.Meeting AS m ON m.MeetingId = ai.MeetingId AND m.IsDeleted = 0
    WHERE ai.MeetingActionItemId = @ItemId AND ai.IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    DECLARE @Want TABLE (LogKind NVARCHAR(32) PRIMARY KEY);
    INSERT INTO @Want (LogKind)
    SELECT DISTINCT TRIM(value) FROM STRING_SPLIT(ISNULL(@Kinds, N''), N',') WHERE TRIM(value) <> N'';
    IF EXISTS (SELECT 1 FROM @Want
               WHERE LogKind NOT IN (N'Decision', N'AssumptionConstraint', N'RiskIssue', N'QuestionAnswer', N'ParkingLotItem'))
        THROW 50004, N'VALIDATION:Unknown governance log', 1;
    IF EXISTS (SELECT 1 FROM @Want) AND NULLIF(TRIM(@Title), N'') IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();
    DECLARE @LoggedOn DATETIME2 = ISNULL(@MeetingDate, @Now);
    DECLARE @Rec INT, @Ver BIGINT, @Synced BIGINT;
    DECLARE @Done TABLE (LogKind NVARCHAR(32) NOT NULL, RecordId INT NOT NULL, Ver BIGINT NULL, Action NVARCHAR(16) NOT NULL);

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK)
    WHERE ProjectId = @ProjectId AND IsDeleted = 0;
    IF @Locked IS NULL
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    DECLARE @CurrentVer BIGINT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.MeetingActionItem WITH (UPDLOCK)
    WHERE MeetingActionItemId = @ItemId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:MeetingActionItem not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:The action item was changed by someone else', 1;

    IF EXISTS (SELECT 1 FROM @Want WHERE LogKind = N'Decision')
    BEGIN
        SELECT @Rec = NULL, @Ver = NULL, @Synced = NULL;
        SELECT @Rec = r.DecisionId, @Ver = CAST(r.RowVer AS BIGINT), @Synced = l.SyncedRowVer
        FROM app.MeetingActionLogLink AS l
        JOIN app.Decision AS r WITH (UPDLOCK)
          ON r.DecisionId = l.RecordId AND r.ProjectId = @ProjectId AND r.IsDeleted = 0
        WHERE l.MeetingActionItemId = @ItemId AND l.LogKind = N'Decision';
        IF @Rec IS NULL
        BEGIN
            EXEC dbo.usp_Project_AssertAccess
                 @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                 @MinLevel = N'Contributor', @Permission = N'decisions:create', @AllowProjectless = 0;
            DECLARE @DecisionNumber INT =
                ISNULL((SELECT MAX(DecisionNumber) FROM app.Decision WHERE ProjectId = @ProjectId), 0) + 1;
            INSERT INTO app.Decision ([ProjectId], DecisionNumber, [Title], [DateLogged], [ProblemContext], CreatedAtUtc, CreatedBy)
            VALUES (@ProjectId, @DecisionNumber, TRIM(@Title), @LoggedOn, @Text, @Now, @ActorUserId);
            SET @Rec = SCOPE_IDENTITY();
            INSERT INTO @Done SELECT N'Decision', @Rec, CAST(RowVer AS BIGINT), N'Create' FROM app.Decision WHERE DecisionId = @Rec;
        END
        ELSE IF @Ver = @Synced
        BEGIN
            UPDATE app.Decision
            SET [Title] = TRIM(@Title), [ProblemContext] = @Text, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            WHERE DecisionId = @Rec
              AND ([Title] <> TRIM(@Title) OR ISNULL([ProblemContext], N'') <> ISNULL(@Text, N''));
            IF @@ROWCOUNT > 0
            BEGIN
                EXEC dbo.usp_Project_AssertAccess
                     @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                     @MinLevel = N'Contributor', @Permission = N'decisions:update', @AllowProjectless = 0;
                INSERT INTO @Done SELECT N'Decision', @Rec, CAST(RowVer AS BIGINT), N'Update' FROM app.Decision WHERE DecisionId = @Rec;
            END;
        END;
    END;

    IF EXISTS (SELECT 1 FROM @Want WHERE LogKind = N'AssumptionConstraint')
    BEGIN
        SELECT @Rec = NULL, @Ver = NULL, @Synced = NULL;
        SELECT @Rec = r.AssumptionConstraintId, @Ver = CAST(r.RowVer AS BIGINT), @Synced = l.SyncedRowVer
        FROM app.MeetingActionLogLink AS l
        JOIN app.AssumptionConstraint AS r WITH (UPDLOCK)
          ON r.AssumptionConstraintId = l.RecordId AND r.ProjectId = @ProjectId AND r.IsDeleted = 0
        WHERE l.MeetingActionItemId = @ItemId AND l.LogKind = N'AssumptionConstraint';
        IF @Rec IS NULL
        BEGIN
            EXEC dbo.usp_Project_AssertAccess
                 @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                 @MinLevel = N'Contributor', @Permission = N'assumptions-constraints:create', @AllowProjectless = 0;
            INSERT INTO app.AssumptionConstraint ([ProjectId], [Type], [Description], [IsValidated], CreatedBy)
            VALUES (@ProjectId, N'Assumption', @Text, 0, @ActorUserId);
            SET @Rec = SCOPE_IDENTITY();
            INSERT INTO @Done SELECT N'AssumptionConstraint', @Rec, CAST(RowVer AS BIGINT), N'Create'
            FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @Rec;
        END
        ELSE IF @Ver = @Synced
        BEGIN
            UPDATE app.AssumptionConstraint
            SET [Description] = @Text, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            WHERE AssumptionConstraintId = @Rec AND ISNULL([Description], N'') <> ISNULL(@Text, N'');
            IF @@ROWCOUNT > 0
            BEGIN
                EXEC dbo.usp_Project_AssertAccess
                     @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                     @MinLevel = N'Contributor', @Permission = N'assumptions-constraints:update', @AllowProjectless = 0;
                INSERT INTO @Done SELECT N'AssumptionConstraint', @Rec, CAST(RowVer AS BIGINT), N'Update'
                FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @Rec;
            END;
        END;
    END;

    IF EXISTS (SELECT 1 FROM @Want WHERE LogKind = N'RiskIssue')
    BEGIN
        SELECT @Rec = NULL, @Ver = NULL, @Synced = NULL;
        SELECT @Rec = r.RiskIssueId, @Ver = CAST(r.RowVer AS BIGINT), @Synced = l.SyncedRowVer
        FROM app.MeetingActionLogLink AS l
        JOIN app.RiskIssue AS r WITH (UPDLOCK)
          ON r.RiskIssueId = l.RecordId AND r.ProjectId = @ProjectId AND r.IsDeleted = 0
        WHERE l.MeetingActionItemId = @ItemId AND l.LogKind = N'RiskIssue';
        IF @Rec IS NULL
        BEGIN
            EXEC dbo.usp_Project_AssertAccess
                 @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                 @MinLevel = N'Contributor', @Permission = N'risks-issues:create', @AllowProjectless = 0;
            INSERT INTO app.RiskIssue ([ProjectId], [Description], [DateIdentified], CreatedBy)
            VALUES (@ProjectId, @Text, @LoggedOn, @ActorUserId);
            SET @Rec = SCOPE_IDENTITY();
            INSERT INTO @Done SELECT N'RiskIssue', @Rec, CAST(RowVer AS BIGINT), N'Create'
            FROM app.RiskIssue WHERE RiskIssueId = @Rec;
        END
        ELSE IF @Ver = @Synced
        BEGIN
            UPDATE app.RiskIssue
            SET [Description] = @Text, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            WHERE RiskIssueId = @Rec AND ISNULL([Description], N'') <> ISNULL(@Text, N'');
            IF @@ROWCOUNT > 0
            BEGIN
                EXEC dbo.usp_Project_AssertAccess
                     @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                     @MinLevel = N'Contributor', @Permission = N'risks-issues:update', @AllowProjectless = 0;
                INSERT INTO @Done SELECT N'RiskIssue', @Rec, CAST(RowVer AS BIGINT), N'Update'
                FROM app.RiskIssue WHERE RiskIssueId = @Rec;
            END;
        END;
    END;

    IF EXISTS (SELECT 1 FROM @Want WHERE LogKind = N'QuestionAnswer')
    BEGIN
        SELECT @Rec = NULL, @Ver = NULL, @Synced = NULL;
        SELECT @Rec = r.QuestionAnswerId, @Ver = CAST(r.RowVer AS BIGINT), @Synced = l.SyncedRowVer
        FROM app.MeetingActionLogLink AS l
        JOIN app.QuestionAnswer AS r WITH (UPDLOCK)
          ON r.QuestionAnswerId = l.RecordId AND r.ProjectId = @ProjectId AND r.IsDeleted = 0
        WHERE l.MeetingActionItemId = @ItemId AND l.LogKind = N'QuestionAnswer';
        IF @Rec IS NULL
        BEGIN
            EXEC dbo.usp_Project_AssertAccess
                 @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                 @MinLevel = N'Contributor', @Permission = N'questions-answers:create', @AllowProjectless = 0;
            INSERT INTO app.QuestionAnswer (ProjectId, Question, CreatedBy)
            VALUES (@ProjectId, @Text, @ActorUserId);
            SET @Rec = SCOPE_IDENTITY();
            INSERT INTO @Done SELECT N'QuestionAnswer', @Rec, CAST(RowVer AS BIGINT), N'Create'
            FROM app.QuestionAnswer WHERE QuestionAnswerId = @Rec;
        END
        ELSE IF @Ver = @Synced
        BEGIN
            UPDATE app.QuestionAnswer
            SET Question = @Text, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            WHERE QuestionAnswerId = @Rec AND ISNULL(Question, N'') <> ISNULL(@Text, N'');
            IF @@ROWCOUNT > 0
            BEGIN
                EXEC dbo.usp_Project_AssertAccess
                     @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                     @MinLevel = N'Contributor', @Permission = N'questions-answers:update', @AllowProjectless = 0;
                INSERT INTO @Done SELECT N'QuestionAnswer', @Rec, CAST(RowVer AS BIGINT), N'Update'
                FROM app.QuestionAnswer WHERE QuestionAnswerId = @Rec;
            END;
        END;
    END;

    IF EXISTS (SELECT 1 FROM @Want WHERE LogKind = N'ParkingLotItem')
    BEGIN
        SELECT @Rec = NULL, @Ver = NULL, @Synced = NULL;
        SELECT @Rec = r.ParkingLotItemId, @Ver = CAST(r.RowVer AS BIGINT), @Synced = l.SyncedRowVer
        FROM app.MeetingActionLogLink AS l
        JOIN app.ParkingLotItem AS r WITH (UPDLOCK)
          ON r.ParkingLotItemId = l.RecordId AND r.ProjectId = @ProjectId AND r.IsDeleted = 0
        WHERE l.MeetingActionItemId = @ItemId AND l.LogKind = N'ParkingLotItem';
        IF @Rec IS NULL
        BEGIN
            EXEC dbo.usp_Project_AssertAccess
                 @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                 @MinLevel = N'Contributor', @Permission = N'parking-lot:create', @AllowProjectless = 0;
            INSERT INTO app.ParkingLotItem ([ProjectId], [ParkingLotItem], CreatedBy)
            VALUES (@ProjectId, TRIM(@Title), @ActorUserId);
            SET @Rec = SCOPE_IDENTITY();
            INSERT INTO @Done SELECT N'ParkingLotItem', @Rec, CAST(RowVer AS BIGINT), N'Create'
            FROM app.ParkingLotItem WHERE ParkingLotItemId = @Rec;
        END
        ELSE IF @Ver = @Synced
        BEGIN
            UPDATE app.ParkingLotItem
            SET [ParkingLotItem] = TRIM(@Title), UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            WHERE ParkingLotItemId = @Rec AND ISNULL([ParkingLotItem], N'') <> TRIM(@Title);
            IF @@ROWCOUNT > 0
            BEGIN
                EXEC dbo.usp_Project_AssertAccess
                     @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
                     @MinLevel = N'Contributor', @Permission = N'parking-lot:update', @AllowProjectless = 0;
                INSERT INTO @Done SELECT N'ParkingLotItem', @Rec, CAST(RowVer AS BIGINT), N'Update'
                FROM app.ParkingLotItem WHERE ParkingLotItemId = @Rec;
            END;
        END;
    END;

    DELETE l
    OUTPUT deleted.LogKind, deleted.RecordId, NULL, N'Unlink' INTO @Done (LogKind, RecordId, Ver, Action)
    FROM app.MeetingActionLogLink AS l
    WHERE l.MeetingActionItemId = @ItemId
      AND NOT EXISTS (SELECT 1 FROM @Want AS w WHERE w.LogKind = l.LogKind);

    UPDATE l SET RecordId = d.RecordId, SyncedRowVer = d.Ver
    FROM app.MeetingActionLogLink AS l
    JOIN @Done AS d ON d.LogKind = l.LogKind AND d.Action IN (N'Create', N'Update')
    WHERE l.MeetingActionItemId = @ItemId;

    INSERT INTO app.MeetingActionLogLink (MeetingActionItemId, LogKind, RecordId, SyncedRowVer, CreatedBy)
    SELECT @ItemId, d.LogKind, d.RecordId, d.Ver, @ActorUserId
    FROM @Done AS d
    WHERE d.Action = N'Create'
      AND NOT EXISTS (SELECT 1 FROM app.MeetingActionLogLink AS l
                      WHERE l.MeetingActionItemId = @ItemId AND l.LogKind = d.LogKind);

    IF EXISTS (SELECT 1 FROM @Done)
    BEGIN
        UPDATE app.MeetingActionItem
        SET UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
        WHERE MeetingActionItemId = @ItemId;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        SELECT @ActorUserId,
               CASE WHEN d.Action = N'Unlink' THEN N'Update' ELSE d.Action END,
               CASE WHEN d.Action = N'Unlink' THEN N'app.MeetingActionItem' ELSE N'app.' + d.LogKind END,
               CAST(CASE WHEN d.Action = N'Unlink' THEN @ItemId ELSE d.RecordId END AS NVARCHAR(64)),
               (SELECT @ItemId AS FromActionItemId, d.LogKind AS LogKind, d.RecordId AS RecordId,
                       d.Action AS LinkAction
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM @Done AS d;
    END;

    COMMIT;

    SELECT @ProjectId AS ProjectId, @MeetingId AS MeetingId, CAST(ai.RowVer AS BIGINT) AS RowVer,
           (SELECT l.LogKind, l.RecordId FROM app.MeetingActionLogLink AS l
            WHERE l.MeetingActionItemId = @ItemId ORDER BY l.LogKind
            FOR JSON PATH) AS LinksJson
    FROM app.MeetingActionItem AS ai
    WHERE ai.MeetingActionItemId = @ItemId;
END;
GO
