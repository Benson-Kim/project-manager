-- 070_key_deliverable_blocked_status.sql — The deliverable status list gains Blocked, so a
-- milestone can read Not Started, In Progress, Blocked or Done. Blocked is locked, as the other
-- labels the code reads by name are, and goes straight after On Hold. Only when Blocked is not in
-- the list yet are the options after On Hold moved down one place, so re-running never reorders
-- an Admin's list, and matching on the label never resurrects an option an Admin removed.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'key-deliverable.status', N'Blocked', 5, 1);

IF NOT EXISTS (SELECT 1 FROM app.LookupOption
               WHERE ListKey = N'key-deliverable.status' AND Label = N'Blocked')
BEGIN
    DECLARE @After INT = (SELECT MAX(SortOrder) FROM app.LookupOption
                          WHERE ListKey = N'key-deliverable.status' AND Label = N'On Hold'
                            AND IsDeleted = 0);
    IF @After IS NOT NULL
    BEGIN
        UPDATE app.LookupOption SET SortOrder = SortOrder + 1
        WHERE ListKey = N'key-deliverable.status' AND SortOrder > @After;
        UPDATE @Seed SET SortOrder = @After + 1;
    END;

    INSERT INTO app.LookupOption (ListKey, Label, SortOrder, IsLocked, Color, CreatedBy)
    SELECT ListKey, Label, SortOrder, IsLocked, 'red', 0 FROM @Seed;
END;
GO
