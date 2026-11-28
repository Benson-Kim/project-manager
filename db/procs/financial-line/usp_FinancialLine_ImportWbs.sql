-- usp_FinancialLine_ImportWbs - copy the project's WBS budget into a financial as operating lines.
-- One line per live leaf WBS item with a budget above zero, described "<WBS no> <item>", its whole
-- budget in the fiscal year of its deadline (else its start date, else the first year), held inside
-- the financial's horizon. An item that already has a live line here is left alone, so importing
-- again adds only the new items; deleting an imported line lets the next import add it back.
-- Access: Manager with 'financials:create' on the financial's project (usp_Financial_AssertAccess).
-- Validation (50004): at most 300 live lines per financial after the import, counted under an update
-- lock on the financial row; a budget must fit a line amount (999,999,999.99).
-- Audited in-transaction (one Create row per line); returns one row: Added, AlreadyThere.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialLine_ImportWbs
    @FinancialId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    EXEC dbo.usp_Financial_AssertAccess
         @FinancialId = @FinancialId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:create';

    BEGIN TRAN;

    DECLARE @First SMALLINT, @Horizon TINYINT, @StartMonth TINYINT, @ProjectId INT;
    SELECT @First = FirstFiscalYear, @Horizon = HorizonYears,
           @StartMonth = FiscalYearStartMonth, @ProjectId = ProjectId
    FROM app.Financial WITH (UPDLOCK, HOLDLOCK)
    WHERE FinancialId = @FinancialId AND IsDeleted = 0;
    IF @First IS NULL
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    DECLARE @Items TABLE (
        KeyDeliverableId INT PRIMARY KEY,
        [Description]    NVARCHAR(255) NOT NULL,
        FiscalYear       SMALLINT NOT NULL,
        Amount           DECIMAL(19,2) NOT NULL,
        WbsKey           NVARCHAR(400) NOT NULL,
        AlreadyThere     BIT NOT NULL);

    INSERT INTO @Items (KeyDeliverableId, [Description], FiscalYear, Amount, WbsKey, AlreadyThere)
    SELECT k.KeyDeliverableId,
           LEFT(LTRIM(RTRIM(w.WbsCode + N' ' + ISNULL(LTRIM(RTRIM(k.KeyRequirement)), N''))), 255),
           CASE WHEN fy.Y IS NULL OR fy.Y < @First THEN @First
                WHEN fy.Y > @First + @Horizon - 1 THEN @First + @Horizon - 1
                ELSE fy.Y END,
           k.Budget,
           w.WbsKey,
           CASE WHEN EXISTS (SELECT 1 FROM app.FinancialLine AS l
                             WHERE l.FinancialId = @FinancialId AND l.KeyDeliverableId = k.KeyDeliverableId
                               AND l.IsDeleted = 0) THEN 1 ELSE 0 END
    FROM app.KeyDeliverable AS k
    JOIN dbo.ufn_KeyDeliverable_WbsCode(@ProjectId) AS w ON w.KeyDeliverableId = k.KeyDeliverableId
    CROSS APPLY (SELECT COALESCE(k.Deadline, k.StartDate) AS D) AS d
    CROSS APPLY (SELECT YEAR(d.D) - CASE WHEN MONTH(d.D) >= @StartMonth THEN 0 ELSE 1 END AS Y) AS fy
    WHERE k.ProjectId = @ProjectId AND k.IsDeleted = 0 AND k.Budget > 0
      AND NOT EXISTS (SELECT 1 FROM app.KeyDeliverable AS c
                      WHERE c.ParentKeyDeliverableId = k.KeyDeliverableId AND c.IsDeleted = 0);

    IF EXISTS (SELECT 1 FROM @Items WHERE AlreadyThere = 0 AND Amount > 999999999.99)
        THROW 50004, N'VALIDATION:A WBS budget is too large for a budget line', 1;
    IF (SELECT COUNT(*) FROM app.FinancialLine WHERE FinancialId = @FinancialId AND IsDeleted = 0)
       + (SELECT COUNT(*) FROM @Items WHERE AlreadyThere = 0) > 300
        THROW 50004, N'VALIDATION:A financial can hold at most 300 lines', 1;

    DECLARE @NextSort INT = ISNULL((SELECT MAX(SortOrder) FROM app.FinancialLine
                                    WHERE FinancialId = @FinancialId AND [Section] = 'operating'
                                      AND IsDeleted = 0), 0);
    DECLARE @Added TABLE (FinancialLineId INT PRIMARY KEY, KeyDeliverableId INT NOT NULL);

    INSERT INTO app.FinancialLine (FinancialId, [Section], [Description], IsRecurrent, SortOrder,
                                   KeyDeliverableId, CreatedBy)
    OUTPUT inserted.FinancialLineId, inserted.KeyDeliverableId INTO @Added
    SELECT @FinancialId, 'operating', i.[Description], 0,
           @NextSort + ROW_NUMBER() OVER (ORDER BY i.WbsKey), i.KeyDeliverableId, @ActorUserId
    FROM @Items AS i
    WHERE i.AlreadyThere = 0;

    INSERT INTO app.FinancialLineAmount (FinancialLineId, FiscalYear, Amount)
    SELECT a.FinancialLineId, i.FiscalYear, i.Amount
    FROM @Added AS a
    JOIN @Items AS i ON i.KeyDeliverableId = a.KeyDeliverableId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    SELECT @ActorUserId, N'Create', N'app.FinancialLine', CAST(a.FinancialLineId AS NVARCHAR(64)),
           (SELECT * FROM dbo.ufn_FinancialLine_Row(a.FinancialLineId) FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM @Added AS a;

    COMMIT;

    SELECT (SELECT COUNT(*) FROM @Added) AS Added,
           (SELECT COUNT(*) FROM @Items WHERE AlreadyThere = 1) AS AlreadyThere;
END;
GO
