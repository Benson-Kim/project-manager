-- 018_lookup_list.sql — managed dropdown lists (ADR-0022).
-- Every dropdown vocabulary moves from code constants into the database so an Admin can edit it
-- from the datasheet header ("Edit dropdown list: X", ADR-0023):
--   1. app.LookupList: one row per list (ListKey = '<entity>.<field>'); its RowVer is the
--      concurrency token for saving the whole list (dbo.usp_LookupList_Set).
--   2. app.LookupOption: the ordered options. Records keep storing the option's label as text,
--      except app.DailyActivity.ActivityStatusId, which references the option by id.
--      IsLocked marks the labels the code depends on (they can be reordered, not renamed or removed).
--   3. Seeds the 18 lists from the vocabularies the forms used until now.
--   4. app.ActivityStatus (migration 001) becomes the list 'daily-activity.status':
--      its rows are copied, DailyActivity.ActivityStatusId is re-pointed at the copies, and the
--      table and its two procs (no callers outside the daily-activities pages) are dropped.
--   5. The CHECK constraints that fixed stakeholder and Q&A vocabularies (migrations 006, 009,
--      011) are dropped: the Create/Update procs validate against the lists instead
--      (dbo.usp_LookupList_AssertLabel), which keeps a record's retired value valid.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.LookupList', N'U') IS NULL
BEGIN
    CREATE TABLE app.LookupList (
        ListKey      NVARCHAR(64) NOT NULL CONSTRAINT PK_LookupList PRIMARY KEY,
        CreatedAtUtc DATETIME2    NOT NULL CONSTRAINT DF_LookupList_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        UpdatedAtUtc DATETIME2    NULL,
        UpdatedBy    INT          NULL,
        RowVer       ROWVERSION
    );
END;
GO

IF OBJECT_ID(N'app.LookupOption', N'U') IS NULL
BEGIN
    CREATE TABLE app.LookupOption (
        LookupOptionId INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_LookupOption PRIMARY KEY,
        ListKey        NVARCHAR(64)  NOT NULL CONSTRAINT FK_LookupOption_LookupList REFERENCES app.LookupList (ListKey),
        Label          NVARCHAR(50)  NOT NULL,
        SortOrder      INT           NOT NULL,
        IsLocked       BIT           NOT NULL CONSTRAINT DF_LookupOption_IsLocked DEFAULT 0,
        IsDeleted      BIT           NOT NULL CONSTRAINT DF_LookupOption_IsDeleted DEFAULT 0,
        DeletedAtUtc   DATETIME2     NULL,
        DeletedBy      INT           NULL,
        CreatedAtUtc   DATETIME2     NOT NULL CONSTRAINT DF_LookupOption_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy      INT           NOT NULL,
        UpdatedAtUtc   DATETIME2     NULL,
        UpdatedBy      INT           NULL,
        RowVer         ROWVERSION,
        CONSTRAINT CK_LookupOption_Label CHECK (LEN(Label) > 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_LookupOption_ListKey_Label'
               AND object_id = OBJECT_ID(N'app.LookupOption'))
    CREATE UNIQUE INDEX UQ_LookupOption_ListKey_Label
        ON app.LookupOption (ListKey, Label) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_LookupOption_ListKey'
               AND object_id = OBJECT_ID(N'app.LookupOption'))
    CREATE INDEX IX_LookupOption_ListKey
        ON app.LookupOption (ListKey, IsDeleted, SortOrder) INCLUDE (Label, IsLocked);
GO

-- The lists and their default options. Locked: the labels the code reads by name —
--   key-deliverable.status: statusToCompletion() / isOverdue();
--   todo-item.status: usp_Todo_BuildFromDailyActivity ('Not Started'), the alert procs and
--     isAlertActive() ('Completed', 'Cancelled');
--   assumption-constraint.type: the two kinds of record the module holds.
DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'project.status',                       N'Not started',  1, 0),
    (N'project.status',                       N'In progress',  2, 0),
    (N'project.status',                       N'On hold',      3, 0),
    (N'project.status',                       N'Completed',    4, 0),
    (N'project.status',                       N'Cancelled',    5, 0),
    (N'project.priority',                     N'High',         1, 0),
    (N'project.priority',                     N'Medium',       2, 0),
    (N'project.priority',                     N'Low',          3, 0),
    (N'project.phase',                        N'Initiation',   1, 0),
    (N'project.phase',                        N'Planning',     2, 0),
    (N'project.phase',                        N'Execution',    3, 0),
    (N'project.phase',                        N'Monitoring',   4, 0),
    (N'project.phase',                        N'Closure',      5, 0),
    (N'project.risk-level',                   N'High',         1, 0),
    (N'project.risk-level',                   N'Medium',       2, 0),
    (N'project.risk-level',                   N'Low',          3, 0),
    (N'stakeholder.communication-preference', N'Email',        1, 0),
    (N'stakeholder.communication-preference', N'Phone',        2, 0),
    (N'stakeholder.communication-preference', N'Meetings',     3, 0),
    (N'stakeholder.engagement-level',         N'High',         1, 0),
    (N'stakeholder.engagement-level',         N'Medium',       2, 0),
    (N'stakeholder.engagement-level',         N'Low',          3, 0),
    (N'supplier.rating',                      N'Excellent',    1, 0),
    (N'supplier.rating',                      N'Good',         2, 0),
    (N'supplier.rating',                      N'Fair',         3, 0),
    (N'supplier.rating',                      N'Poor',         4, 0),
    (N'key-deliverable.status',               N'Pending',      1, 0),
    (N'key-deliverable.status',               N'In Progress',  2, 1),
    (N'key-deliverable.status',               N'Completed',    3, 1),
    (N'key-deliverable.status',               N'On Hold',      4, 1),
    (N'key-deliverable.status',               N'Cancelled',    5, 1),
    (N'key-deliverable.priority',             N'Critical',     1, 0),
    (N'key-deliverable.priority',             N'Important',    2, 0),
    (N'key-deliverable.priority',             N'Normal',       3, 0),
    (N'key-deliverable.priority',             N'Low',          4, 0),
    (N'question-answer.category',             N'General',      1, 0),
    (N'question-answer.category',             N'Technical',    2, 0),
    (N'question-answer.category',             N'Budget',       3, 0),
    (N'question-answer.category',             N'Other',        4, 0),
    (N'question-answer.priority',             N'Critical',     1, 0),
    (N'question-answer.priority',             N'High',         2, 0),
    (N'question-answer.priority',             N'Medium',       3, 0),
    (N'question-answer.priority',             N'Low',          4, 0),
    (N'assumption-constraint.type',           N'Assumption',   1, 1),
    (N'assumption-constraint.type',           N'Constraint',   2, 1),
    (N'assumption-constraint.impact',         N'High',         1, 0),
    (N'assumption-constraint.impact',         N'Medium',       2, 0),
    (N'assumption-constraint.impact',         N'Low',          3, 0),
    (N'daily-activity.status',                N'Not Started',  1, 0),
    (N'daily-activity.status',                N'In Progress',  2, 0),
    (N'daily-activity.status',                N'Completed',    3, 0),
    (N'daily-activity.status',                N'Cancelled',    4, 0),
    (N'daily-activity.contact-method',        N'In Person',    1, 0),
    (N'daily-activity.contact-method',        N'Telephone',    2, 0),
    (N'daily-activity.contact-method',        N'Text Message', 3, 0),
    (N'daily-activity.contact-method',        N'Email',        4, 0),
    (N'daily-activity.contact-method',        N'Meeting',      5, 0),
    (N'daily-activity.contact-method',        N'Other',        6, 0),
    (N'daily-activity.task-type',             N'Admin',        1, 0),
    (N'daily-activity.task-type',             N'Technical',    2, 0),
    (N'daily-activity.task-type',             N'Review',       3, 0),
    (N'daily-activity.task-type',             N'Meeting',      4, 0),
    (N'daily-activity.task-type',             N'Other',        5, 0),
    (N'todo-item.status',                     N'Not Started',  1, 1),
    (N'todo-item.status',                     N'In Progress',  2, 0),
    (N'todo-item.status',                     N'In Review',    3, 0),
    (N'todo-item.status',                     N'Completed',    4, 1),
    (N'todo-item.status',                     N'Cancelled',    5, 1),
    (N'todo-item.priority',                   N'Critical',     1, 0),
    (N'todo-item.priority',                   N'High',         2, 0),
    (N'todo-item.priority',                   N'Medium',       3, 0),
    (N'todo-item.priority',                   N'Low',          4, 0);

MERGE app.LookupList AS t
USING (SELECT DISTINCT ListKey FROM @Seed) AS s
ON t.ListKey = s.ListKey
WHEN NOT MATCHED THEN INSERT (ListKey) VALUES (s.ListKey);

-- Existing activity statuses keep their order (and any an Admin added through the old proc).
IF OBJECT_ID(N'app.ActivityStatus', N'U') IS NOT NULL
    EXEC (N'
    INSERT INTO app.LookupOption (ListKey, Label, SortOrder, CreatedBy)
    SELECT N''daily-activity.status'', s.Name, s.SortOrder, 0
    FROM app.ActivityStatus s
    WHERE NOT EXISTS (SELECT 1 FROM app.LookupOption o
                      WHERE o.ListKey = N''daily-activity.status'' AND o.Label = s.Name);');

-- Matching on the label (live or retired) never resurrects an option an Admin removed.
MERGE app.LookupOption AS t
USING @Seed AS s
ON t.ListKey = s.ListKey AND t.Label = s.Label
WHEN MATCHED AND s.IsLocked = 1 AND t.IsLocked = 0 THEN UPDATE SET IsLocked = 1
WHEN NOT MATCHED THEN INSERT (ListKey, Label, SortOrder, IsLocked, CreatedBy)
                      VALUES (s.ListKey, s.Label, s.SortOrder, s.IsLocked, 0);
GO

-- Re-point DailyActivity.ActivityStatusId from app.ActivityStatus to the copied options.
-- One transaction: the old FK's presence is the "not yet re-pointed" marker, so it must not
-- disappear without the ids moving with it.
SET XACT_ABORT ON;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_DailyActivity_ActivityStatus_ActivityStatusId'
           AND parent_object_id = OBJECT_ID(N'app.DailyActivity'))
BEGIN
    BEGIN TRAN;

    ALTER TABLE app.DailyActivity DROP CONSTRAINT FK_DailyActivity_ActivityStatus_ActivityStatusId;

    EXEC (N'
    UPDATE da SET ActivityStatusId = o.LookupOptionId
    FROM app.DailyActivity da
    JOIN app.ActivityStatus s ON s.ActivityStatusId = da.ActivityStatusId
    JOIN app.LookupOption o   ON o.ListKey = N''daily-activity.status'' AND o.Label = s.Name
                              AND o.IsDeleted = 0;');

    ALTER TABLE app.DailyActivity
        ADD CONSTRAINT FK_DailyActivity_ActivityStatus
        FOREIGN KEY (ActivityStatusId) REFERENCES app.LookupOption (LookupOptionId);

    COMMIT;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_DailyActivity_ActivityStatus'
               AND parent_object_id = OBJECT_ID(N'app.DailyActivity'))
    ALTER TABLE app.DailyActivity
        ADD CONSTRAINT FK_DailyActivity_ActivityStatus
        FOREIGN KEY (ActivityStatusId) REFERENCES app.LookupOption (LookupOptionId);
GO

DROP PROCEDURE IF EXISTS dbo.usp_ActivityStatus_Create;
DROP PROCEDURE IF EXISTS dbo.usp_ActivityStatus_List;
DROP TABLE IF EXISTS app.ActivityStatus;
GO

-- The lists replace the fixed vocabularies.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Stakeholder_CommunicationPreference'
           AND parent_object_id = OBJECT_ID(N'app.Stakeholder'))
    ALTER TABLE app.Stakeholder DROP CONSTRAINT CK_Stakeholder_CommunicationPreference;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Stakeholder_EngagementLevel'
           AND parent_object_id = OBJECT_ID(N'app.Stakeholder'))
    ALTER TABLE app.Stakeholder DROP CONSTRAINT CK_Stakeholder_EngagementLevel;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_QuestionAnswer_Category'
           AND parent_object_id = OBJECT_ID(N'app.QuestionAnswer'))
    ALTER TABLE app.QuestionAnswer DROP CONSTRAINT CK_QuestionAnswer_Category;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_QuestionAnswer_Priority'
           AND parent_object_id = OBJECT_ID(N'app.QuestionAnswer'))
    ALTER TABLE app.QuestionAnswer DROP CONSTRAINT CK_QuestionAnswer_Priority;
GO
