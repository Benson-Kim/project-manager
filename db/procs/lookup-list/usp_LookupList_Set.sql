-- usp_LookupList_Set — saves one dropdown list as a whole (ADR-0022), from the "Edit dropdown list"
-- dialog: @OptionsJson lists the options in display order, e.g.
--   [{"id": 12, "label": "High"}, {"id": null, "label": "Blocked"}]
--   * Admin only (FORBIDDEN_ROW 50003): every project shares the lists.
--   * @RowVer is app.LookupList.RowVer as read (dbo.usp_LookupList_GetOptions); a mismatch is
--     CONFLICT 50002, so two editors can't silently overwrite each other.
--   * An id keeps that option; a new label renames it, and records that store the label as text
--     follow in the same transaction (the cascade below). Position sets SortOrder.
--   * A live option missing from the array is retired (soft delete); records keep their value.
--   * A null id adds the label, bringing back a retired option with that label when there is one
--     (records that reference it by id see it again).
--   * Locked options (the labels the code reads) must stay and keep their label.
--   * Labels are trimmed, 1–50 characters (the narrowest bound column) and unique in the list ignoring case.
--   Every rule failure is VALIDATION 50004; an unknown list is NOT_FOUND 50001.
-- Writes one audit row (EntityName app.LookupList, EntityId = ListKey, live options before/after).
-- Returns the saved list in the shape of dbo.usp_LookupList_GetOptions.
-- Entity app.LookupList / app.LookupOption. Module: lookup-lists (datasheet).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_LookupList_Set
    @ListKey     NVARCHAR(64),
    @OptionsJson NVARCHAR(MAX),
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole <> N'Admin'
        THROW 50003, N'FORBIDDEN_ROW:Only administrators can edit dropdown lists', 1;

    DECLARE @CurrentVer BIGINT;
    SELECT @CurrentVer = CAST(RowVer AS BIGINT) FROM app.LookupList WHERE ListKey = @ListKey;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Dropdown list not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:The list was changed by someone else', 1;

    IF ISJSON(@OptionsJson) IS NULL OR ISJSON(@OptionsJson) = 0 OR LEFT(LTRIM(@OptionsJson), 1) <> N'['
        THROW 50004, N'VALIDATION:Options must be a JSON array', 1;
    IF EXISTS (SELECT 1 FROM OPENJSON(@OptionsJson) WHERE [type] <> 5)
        THROW 50004, N'VALIDATION:Each option must be an object', 1;

    DECLARE @In TABLE (
        Ord            INT           NOT NULL PRIMARY KEY,
        LookupOptionId INT           NULL,
        Label          NVARCHAR(400) NULL
    );
    INSERT INTO @In (Ord, LookupOptionId, Label)
    SELECT CAST(j.[key] AS INT) + 1, o.id, TRIM(o.label)
    FROM OPENJSON(@OptionsJson) j
    CROSS APPLY OPENJSON(j.[value]) WITH (id INT '$.id', label NVARCHAR(400) '$.label') o;

    IF EXISTS (SELECT 1 FROM @In WHERE Label IS NULL OR LEN(Label) = 0 OR LEN(Label) > 50)
        THROW 50004, N'VALIDATION:Each option needs a name of up to 50 characters', 1;
    IF EXISTS (SELECT 1 FROM @In GROUP BY Label HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:Option names must be unique', 1;
    IF EXISTS (SELECT 1 FROM @In WHERE LookupOptionId IS NOT NULL
               GROUP BY LookupOptionId HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:An option appears twice', 1;
    IF EXISTS (SELECT 1 FROM @In i
               WHERE i.LookupOptionId IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM app.LookupOption o
                                 WHERE o.LookupOptionId = i.LookupOptionId
                                   AND o.ListKey = @ListKey AND o.IsDeleted = 0))
        THROW 50004, N'VALIDATION:An option is not in this list', 1;
    IF EXISTS (SELECT 1 FROM app.LookupOption o
               WHERE o.ListKey = @ListKey AND o.IsDeleted = 0 AND o.IsLocked = 1
                 AND NOT EXISTS (SELECT 1 FROM @In i
                                 WHERE i.LookupOptionId = o.LookupOptionId
                                   AND i.Label = o.Label COLLATE Latin1_General_100_BIN2))
        THROW 50004, N'VALIDATION:Locked options can''t be renamed or removed', 1;

    DECLARE @Renamed TABLE (OldLabel NVARCHAR(50) NOT NULL, NewLabel NVARCHAR(50) NOT NULL);
    INSERT INTO @Renamed (OldLabel, NewLabel)
    SELECT o.Label, i.Label
    FROM @In i
    JOIN app.LookupOption o ON o.LookupOptionId = i.LookupOptionId
    WHERE i.Label <> o.Label COLLATE Latin1_General_100_BIN2;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT LookupOptionId, Label, SortOrder, IsLocked
         FROM app.LookupOption WHERE ListKey = @ListKey AND IsDeleted = 0
         ORDER BY SortOrder
         FOR JSON PATH);

    BEGIN TRAN;

    -- 1. Retire the live options left out.
    UPDATE o SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    FROM app.LookupOption o
    WHERE o.ListKey = @ListKey AND o.IsDeleted = 0
      AND NOT EXISTS (SELECT 1 FROM @In i WHERE i.LookupOptionId = o.LookupOptionId);

    -- 2. Rename and reorder the options kept (one statement, so swapping two labels works).
    UPDATE o SET Label = i.Label, SortOrder = i.Ord,
                 UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    FROM app.LookupOption o
    JOIN @In i ON i.LookupOptionId = o.LookupOptionId
    WHERE o.Label <> i.Label COLLATE Latin1_General_100_BIN2 OR o.SortOrder <> i.Ord;

    -- 3. New labels: bring back the most recently retired option with that label, else insert.
    UPDATE o SET IsDeleted = 0, DeletedAtUtc = NULL, DeletedBy = NULL,
                 Label = i.Label, SortOrder = i.Ord,
                 UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    FROM @In i
    CROSS APPLY (SELECT TOP (1) r.LookupOptionId
                 FROM app.LookupOption r
                 WHERE r.ListKey = @ListKey AND r.IsDeleted = 1 AND r.Label = i.Label
                 ORDER BY r.DeletedAtUtc DESC, r.LookupOptionId DESC) pick
    JOIN app.LookupOption o ON o.LookupOptionId = pick.LookupOptionId
    WHERE i.LookupOptionId IS NULL;

    INSERT INTO app.LookupOption (ListKey, Label, SortOrder, CreatedBy)
    SELECT @ListKey, i.Label, i.Ord, @ActorUserId
    FROM @In i
    WHERE i.LookupOptionId IS NULL
      AND NOT EXISTS (SELECT 1 FROM app.LookupOption o
                      WHERE o.ListKey = @ListKey AND o.IsDeleted = 0 AND o.Label = i.Label);

    -- 4. Records that store the label as text follow a rename (soft-deleted ones too, so a
    --    restored record matches the list). One line per text-bound list; every list seeded by
    --    migration 018 is either here or stored by id — src/tests/lookup-lists.test.ts checks this.
    --    'daily-activity.status' is stored by id (DailyActivity.ActivityStatusId): nothing to do.
    IF EXISTS (SELECT 1 FROM @Renamed)
    BEGIN
        DECLARE @Now DATETIME2 = SYSUTCDATETIME();
        IF @ListKey = N'project.status'
            UPDATE t SET [ProjectStatus] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.Project t JOIN @Renamed r ON t.[ProjectStatus] = r.OldLabel;
        ELSE IF @ListKey = N'project.priority'
            UPDATE t SET [ProjectPriority] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.Project t JOIN @Renamed r ON t.[ProjectPriority] = r.OldLabel;
        ELSE IF @ListKey = N'project.phase'
            UPDATE t SET [ProjectPhase] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.Project t JOIN @Renamed r ON t.[ProjectPhase] = r.OldLabel;
        ELSE IF @ListKey = N'project.risk-level'
            UPDATE t SET [RiskLevel] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.Project t JOIN @Renamed r ON t.[RiskLevel] = r.OldLabel;
        ELSE IF @ListKey = N'stakeholder.communication-preference'
            UPDATE t SET [CommunicationPreference] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.Stakeholder t JOIN @Renamed r ON t.[CommunicationPreference] = r.OldLabel;
        ELSE IF @ListKey = N'stakeholder.engagement-level'
            UPDATE t SET [EngagementLevel] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.Stakeholder t JOIN @Renamed r ON t.[EngagementLevel] = r.OldLabel;
        ELSE IF @ListKey = N'supplier.rating'
            UPDATE t SET [Rating] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.Supplier t JOIN @Renamed r ON t.[Rating] = r.OldLabel;
        ELSE IF @ListKey = N'key-deliverable.status'
            UPDATE t SET [Status] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.KeyDeliverable t JOIN @Renamed r ON t.[Status] = r.OldLabel;
        ELSE IF @ListKey = N'key-deliverable.priority'
            UPDATE t SET [Priority] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.KeyDeliverable t JOIN @Renamed r ON t.[Priority] = r.OldLabel;
        ELSE IF @ListKey = N'question-answer.category'
            UPDATE t SET [Category] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.QuestionAnswer t JOIN @Renamed r ON t.[Category] = r.OldLabel;
        ELSE IF @ListKey = N'question-answer.priority'
            UPDATE t SET [Priority] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.QuestionAnswer t JOIN @Renamed r ON t.[Priority] = r.OldLabel;
        ELSE IF @ListKey = N'assumption-constraint.type'
            UPDATE t SET [Type] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.AssumptionConstraint t JOIN @Renamed r ON t.[Type] = r.OldLabel;
        ELSE IF @ListKey = N'assumption-constraint.impact'
            UPDATE t SET [Impact] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.AssumptionConstraint t JOIN @Renamed r ON t.[Impact] = r.OldLabel;
        ELSE IF @ListKey = N'daily-activity.contact-method'
            UPDATE t SET [ContactMethod] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.DailyActivity t JOIN @Renamed r ON t.[ContactMethod] = r.OldLabel;
        ELSE IF @ListKey = N'daily-activity.task-type'
            UPDATE t SET [TaskType] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.DailyActivity t JOIN @Renamed r ON t.[TaskType] = r.OldLabel;
        ELSE IF @ListKey = N'todo-item.status'
            UPDATE t SET [Status] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.TodoItem t JOIN @Renamed r ON t.[Status] = r.OldLabel;
        ELSE IF @ListKey = N'todo-item.priority'
            UPDATE t SET [Priority] = r.NewLabel, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
            FROM app.TodoItem t JOIN @Renamed r ON t.[Priority] = r.OldLabel;
    END;

    -- 5. Move the list's RowVer so a stale editor gets CONFLICT.
    UPDATE app.LookupList SET UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ListKey = @ListKey;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.LookupList', @ListKey, @Before,
            (SELECT LookupOptionId, Label, SortOrder, IsLocked
             FROM app.LookupOption WHERE ListKey = @ListKey AND IsDeleted = 0
             ORDER BY SortOrder
             FOR JSON PATH));

    COMMIT;

    DECLARE @Keys NVARCHAR(MAX) = N'["' + STRING_ESCAPE(@ListKey, 'json') + N'"]';
    EXEC dbo.usp_LookupList_GetOptions @ActorUserId = @ActorUserId, @ListKeys = @Keys;
END;
GO
