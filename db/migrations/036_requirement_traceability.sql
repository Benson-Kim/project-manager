-- 036_requirement_traceability.sql — project requirement register and traceability (ADR-0037).
-- Renames the per-item requirement (035) into one project-level app.Requirement with a type, a
-- per-project reference number, trace links (solution -> need) and deliverable allocations.
-- Idempotent: every object is guarded, and the data move runs only while the old table still exists.
-- Works batch by batch under scripts/db-apply.sh and inside the desktop runner's single
-- per-migration transaction (electron/db-apply.ts): its own BEGIN TRAN nests there, and it uses
-- nothing SQL Server refuses inside a transaction.
USE ProjectManager;
GO

-- Backs the composite FKs that keep an allocation inside its requirement's project.
-- ProjectId is nullable on app.KeyDeliverable; (KeyDeliverableId, ProjectId) is still unique.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_KeyDeliverable_Id_Project'
                 AND object_id = OBJECT_ID(N'app.KeyDeliverable'))
    CREATE UNIQUE INDEX UX_KeyDeliverable_Id_Project
        ON app.KeyDeliverable (KeyDeliverableId, ProjectId);
GO

IF OBJECT_ID(N'app.Requirement', N'U') IS NULL
BEGIN
    CREATE TABLE app.Requirement (
        RequirementId   INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_Requirement PRIMARY KEY,
        ProjectId       INT NOT NULL
            CONSTRAINT FK_Requirement_Project REFERENCES app.Project (ProjectId),
        RequirementType VARCHAR(3) NOT NULL
            CONSTRAINT CK_Requirement_Type CHECK (RequirementType IN ('BR', 'SR', 'FR', 'NFR', 'TR')),
        Number          INT NOT NULL
            CONSTRAINT CK_Requirement_Number CHECK (Number > 0),
        Requirement     NVARCHAR(4000) NOT NULL,
        IsMet           BIT NOT NULL
            CONSTRAINT DF_Requirement_IsMet DEFAULT 0,
        IsDeleted       BIT NOT NULL CONSTRAINT DF_Requirement_IsDeleted DEFAULT 0,
        DeletedAtUtc    DATETIME2 NULL,
        DeletedBy       INT NULL,
        CreatedAtUtc    DATETIME2 NOT NULL CONSTRAINT DF_Requirement_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy       INT NOT NULL,
        UpdatedAtUtc    DATETIME2 NULL,
        UpdatedBy       INT NULL,
        RowVer          ROWVERSION,
        CONSTRAINT UQ_Requirement_Project UNIQUE (RequirementId, ProjectId),
        -- Table-level: a column CHECK may not name a second column (error 8141).
        CONSTRAINT CK_Requirement_Met CHECK (IsMet = 0 OR RequirementType IN ('FR', 'NFR', 'TR'))
    );
END;
GO

-- One reference per project and type (FR-1, FR-2…), never reused after a delete. Serves both the
-- register's list and the Gantt freshness stamp, so no separate stamp index is needed.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Requirement_Number'
                 AND object_id = OBJECT_ID(N'app.Requirement'))
    CREATE UNIQUE INDEX UX_Requirement_Number
        ON app.Requirement (ProjectId, RequirementType, Number)
        INCLUDE (IsDeleted, IsMet, RowVer);
GO

-- A trace link: a solution requirement validates a need. Both sides stay in the same project
-- (composite FKs). No cascade: two cascading FKs to one table is error 1785; the delete procs
-- remove links in the same transaction.
IF OBJECT_ID(N'app.RequirementTrace', N'U') IS NULL
BEGIN
    CREATE TABLE app.RequirementTrace (
        ProjectId             INT NOT NULL,
        RequirementId         INT NOT NULL,
        ValidatesRequirementId INT NOT NULL,
        CreatedAtUtc          DATETIME2 NOT NULL CONSTRAINT DF_RequirementTrace_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy             INT NOT NULL,
        CONSTRAINT PK_RequirementTrace PRIMARY KEY (RequirementId, ValidatesRequirementId),
        CONSTRAINT FK_RequirementTrace_Requirement
            FOREIGN KEY (RequirementId, ProjectId) REFERENCES app.Requirement (RequirementId, ProjectId),
        CONSTRAINT FK_RequirementTrace_Validates
            FOREIGN KEY (ValidatesRequirementId, ProjectId) REFERENCES app.Requirement (RequirementId, ProjectId),
        CONSTRAINT CK_RequirementTrace_Distinct CHECK (RequirementId <> ValidatesRequirementId)
    );
    CREATE INDEX IX_RequirementTrace_Validates
        ON app.RequirementTrace (ValidatesRequirementId) INCLUDE (RequirementId);
END;
GO

-- An allocation of a solution requirement to a deliverable, ordered under that deliverable. Both
-- sides stay in the same project (composite FKs). RowVer carries the Gantt stamp.
IF OBJECT_ID(N'app.RequirementDeliverable', N'U') IS NULL
BEGIN
    CREATE TABLE app.RequirementDeliverable (
        ProjectId        INT NOT NULL,
        RequirementId    INT NOT NULL,
        KeyDeliverableId INT NOT NULL,
        SortOrder        INT NOT NULL
            CONSTRAINT CK_RequirementDeliverable_SortOrder CHECK (SortOrder > 0),
        CreatedAtUtc     DATETIME2 NOT NULL CONSTRAINT DF_RequirementDeliverable_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy        INT NOT NULL,
        RowVer           ROWVERSION,
        CONSTRAINT PK_RequirementDeliverable PRIMARY KEY (RequirementId, KeyDeliverableId),
        CONSTRAINT FK_RequirementDeliverable_Requirement
            FOREIGN KEY (RequirementId, ProjectId) REFERENCES app.Requirement (RequirementId, ProjectId),
        CONSTRAINT FK_RequirementDeliverable_KeyDeliverable
            FOREIGN KEY (KeyDeliverableId, ProjectId) REFERENCES app.KeyDeliverable (KeyDeliverableId, ProjectId)
    );
    CREATE INDEX IX_RequirementDeliverable_Deliverable
        ON app.RequirementDeliverable (KeyDeliverableId, SortOrder) INCLUDE (RequirementId);
    CREATE INDEX IX_RequirementDeliverable_Project
        ON app.RequirementDeliverable (ProjectId) INCLUDE (RowVer);
END;
GO

-- Move the 035 rows across, then drop the old table, in one transaction. The old table is locked
-- for the whole move so no write can land between the copy and the drop; a count mismatch rolls
-- the move back rather than losing data silently.
IF OBJECT_ID(N'app.KeyDeliverableRequirement', N'U') IS NOT NULL
BEGIN
    SET XACT_ABORT ON;
    BEGIN TRAN;

    DECLARE @OldCount INT = (SELECT COUNT(*) FROM app.KeyDeliverableRequirement WITH (TABLOCKX, HOLDLOCK));

    -- A requirement with no project (its item has none) cannot get a reference; refuse rather than
    -- drop it. app.KeyDeliverable.ProjectId is nullable.
    IF EXISTS (SELECT 1 FROM app.KeyDeliverableRequirement r
               JOIN app.KeyDeliverable kd ON kd.KeyDeliverableId = r.KeyDeliverableId
               WHERE kd.ProjectId IS NULL)
        THROW 50000, N'Cannot migrate a requirement whose deliverable has no project', 1;

    -- Every old row becomes a functional requirement, numbered FR-1… per project in creation order,
    -- keeping its id so audit history still matches. A row under a deleted item is copied as deleted.
    SET IDENTITY_INSERT app.Requirement ON;
    INSERT INTO app.Requirement
        (RequirementId, ProjectId, RequirementType, Number, Requirement, IsMet,
         IsDeleted, DeletedAtUtc, DeletedBy, CreatedAtUtc, CreatedBy, UpdatedAtUtc, UpdatedBy)
    SELECT r.KeyDeliverableRequirementId,
           kd.ProjectId,
           'FR',
           ROW_NUMBER() OVER (PARTITION BY kd.ProjectId ORDER BY r.CreatedAtUtc, r.KeyDeliverableRequirementId),
           r.Requirement,
           r.IsMet,
           CASE WHEN r.IsDeleted = 1 OR kd.IsDeleted = 1 THEN 1 ELSE 0 END,
           CASE WHEN r.IsDeleted = 1 THEN r.DeletedAtUtc WHEN kd.IsDeleted = 1 THEN kd.DeletedAtUtc END,
           CASE WHEN r.IsDeleted = 1 THEN r.DeletedBy WHEN kd.IsDeleted = 1 THEN kd.DeletedBy END,
           r.CreatedAtUtc,
           r.CreatedBy,
           r.UpdatedAtUtc,
           r.UpdatedBy
    FROM app.KeyDeliverableRequirement r
    JOIN app.KeyDeliverable kd ON kd.KeyDeliverableId = r.KeyDeliverableId;
    DECLARE @Copied INT = @@ROWCOUNT;
    SET IDENTITY_INSERT app.Requirement OFF;

    -- A live row under a live item keeps its allocation, with the same order renumbered to 1…n.
    INSERT INTO app.RequirementDeliverable (ProjectId, RequirementId, KeyDeliverableId, SortOrder, CreatedBy)
    SELECT kd.ProjectId,
           r.KeyDeliverableRequirementId,
           r.KeyDeliverableId,
           ROW_NUMBER() OVER (PARTITION BY r.KeyDeliverableId ORDER BY r.SortOrder, r.KeyDeliverableRequirementId),
           r.CreatedBy
    FROM app.KeyDeliverableRequirement r
    JOIN app.KeyDeliverable kd ON kd.KeyDeliverableId = r.KeyDeliverableId AND kd.IsDeleted = 0
    WHERE r.IsDeleted = 0;
    DECLARE @Placed INT = @@ROWCOUNT;

    DECLARE @ExpectedPlaced INT =
        (SELECT COUNT(*) FROM app.KeyDeliverableRequirement r
         JOIN app.KeyDeliverable kd ON kd.KeyDeliverableId = r.KeyDeliverableId AND kd.IsDeleted = 0
         WHERE r.IsDeleted = 0);

    IF @Copied <> @OldCount
        THROW 50000, N'Requirement migration copied the wrong number of rows', 1;
    IF @Placed <> @ExpectedPlaced
        THROW 50000, N'Requirement migration placed the wrong number of allocations', 1;

    DROP TABLE app.KeyDeliverableRequirement;

    COMMIT;
END;
GO

-- Drop the 035 write procs: they point at the dropped table (LESSONS §31).
IF OBJECT_ID(N'dbo.usp_KeyDeliverableRequirement_Create', N'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_KeyDeliverableRequirement_Create;
GO
IF OBJECT_ID(N'dbo.usp_KeyDeliverableRequirement_Update', N'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_KeyDeliverableRequirement_Update;
GO
IF OBJECT_ID(N'dbo.usp_KeyDeliverableRequirement_Move', N'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_KeyDeliverableRequirement_Move;
GO
IF OBJECT_ID(N'dbo.usp_KeyDeliverableRequirement_Delete', N'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_KeyDeliverableRequirement_Delete;
GO

-- Carry each person's key-deliverables grant or revoke over to the new requirements section, so
-- explicit permissions survive the rename. Read the source under HOLDLOCK inside a transaction.
SET XACT_ABORT ON;
BEGIN TRAN;
INSERT INTO app.ProjectPermissionOverride (ProjectId, UserId, [Module], Verb, Allowed, CreatedBy)
SELECT o.ProjectId, o.UserId, N'requirements', o.Verb, o.Allowed, o.CreatedBy
FROM app.ProjectPermissionOverride o WITH (HOLDLOCK)
WHERE o.[Module] = N'key-deliverables'
  AND NOT EXISTS (SELECT 1 FROM app.ProjectPermissionOverride e
                  WHERE e.ProjectId = o.ProjectId AND e.UserId = o.UserId
                    AND e.[Module] = N'requirements' AND e.Verb = o.Verb);
COMMIT;
GO
