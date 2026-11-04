-- usp_Project_ReplaceObjectiveAlignment — set the strategic objectives one project is aligned to
-- (client updates 2026-11-03, item B; migration 056).
-- Internal: it runs inside a project write proc's transaction, after that proc's own access check,
--   so it asserts no access of its own and refuses to run outside a transaction. Named in EXEMPT in
--   src/tests/proc-access-levels.test.ts; no TS file calls it.
-- Each label must be a live option of 'project.objective-alignment', or one this project already
--   carries — the rule every list-bound value keeps (dbo.usp_LookupList_AssertLabel), so a project
--   does not lose an objective whose option was retired until someone edits the field.
-- Entity app.ProjectObjectiveAlignment. Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_ReplaceObjectiveAlignment
    @ProjectId   INT,
    @Labels      NVARCHAR(MAX),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Objectives are only replaced inside a project write', 1;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;

    IF @Labels IS NULL OR ISJSON(@Labels) <> 1 OR LEFT(LTRIM(@Labels), 1) <> N'['
        THROW 50004, N'VALIDATION:Strategic objectives must be a JSON array', 1;

    IF (SELECT COUNT(*) FROM OPENJSON(@Labels)) > 200
        THROW 50004, N'VALIDATION:A project can list at most 200 strategic objectives', 1;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Labels)
               WHERE [type] <> 1 OR LEN(LTRIM(RTRIM([value]))) = 0 OR LEN([value]) > 50)
        THROW 50004, N'VALIDATION:Each strategic objective must be text of 1 to 50 characters', 1;

    -- Grouped on the trimmed value, the form the rows are stored in: two entries that differ only
    -- by surrounding space are the same objective and answer here, not as a key violation below.
    IF EXISTS (SELECT LTRIM(RTRIM([value])) FROM OPENJSON(@Labels)
               GROUP BY LTRIM(RTRIM([value])) HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:A strategic objective is listed twice', 1;

    DECLARE @Wanted TABLE (Label NVARCHAR(50) PRIMARY KEY);
    INSERT INTO @Wanted (Label)
    SELECT DISTINCT LTRIM(RTRIM([value])) FROM OPENJSON(@Labels);

    -- One label at a time, through the shared check, so this list's policy is the list policy and
    -- not a second copy of it. The set is a handful of labels, capped at 200 above.
    -- AssertLabel answers with the option's exact spelling, which is what gets stored; two entries
    -- that canonicalise to one option collapse here rather than raising a key violation.
    DECLARE @Checked TABLE (Label NVARCHAR(50) PRIMARY KEY);
    DECLARE @Label NVARCHAR(50), @Canonical NVARCHAR(255), @Current NVARCHAR(255);

    WHILE EXISTS (SELECT 1 FROM @Wanted)
    BEGIN
        SELECT TOP (1) @Label = Label FROM @Wanted ORDER BY Label;
        DELETE FROM @Wanted WHERE Label = @Label;

        SET @Canonical = @Label;
        SET @Current = (SELECT TOP (1) a.Label
                        FROM app.ProjectObjectiveAlignment AS a
                        WHERE a.ProjectId = @ProjectId AND a.Label = @Label);

        EXEC dbo.usp_LookupList_AssertLabel
             @ListKey = N'project.objective-alignment', @Label = @Canonical OUTPUT,
             @CurrentLabel = @Current;

        INSERT INTO @Checked (Label)
        SELECT @Canonical
        WHERE NOT EXISTS (SELECT 1 FROM @Checked AS c WHERE c.Label = @Canonical);
    END;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT a.Label AS label
         FROM app.ProjectObjectiveAlignment AS a
         WHERE a.ProjectId = @ProjectId
         ORDER BY a.Label
         FOR JSON PATH, INCLUDE_NULL_VALUES);

    DELETE a FROM app.ProjectObjectiveAlignment AS a
    WHERE a.ProjectId = @ProjectId
      AND a.Label NOT IN (SELECT c.Label FROM @Checked AS c);
    DECLARE @Changed INT = @@ROWCOUNT;

    INSERT INTO app.ProjectObjectiveAlignment (ProjectId, Label, CreatedBy)
    SELECT @ProjectId, c.Label, @ActorUserId
    FROM @Checked AS c
    WHERE NOT EXISTS (SELECT 1 FROM app.ProjectObjectiveAlignment AS a
                      WHERE a.ProjectId = @ProjectId AND a.Label = c.Label);
    SET @Changed = @Changed + @@ROWCOUNT;

    IF @Changed > 0
        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'SetObjectiveAlignment', N'app.Project',
                CAST(@ProjectId AS NVARCHAR(64)), @Before,
                (SELECT a.Label AS label
                 FROM app.ProjectObjectiveAlignment AS a
                 WHERE a.ProjectId = @ProjectId
                 ORDER BY a.Label
                 FOR JSON PATH, INCLUDE_NULL_VALUES));
END;
GO
