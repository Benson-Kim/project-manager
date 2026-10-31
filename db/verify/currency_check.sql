-- currency_check.sql — CI assertion for ADR-0051 decision 8, run as the admin login after
-- scripts/db-apply.sh. CK_Financial_CurrencyCode is the second gate behind zod and the procs, and
-- it only holds while it keeps its binary collation: under the database's case-insensitive
-- collation an [A-Z] range also matches a-z, so the constraint would admit exactly the lower-case
-- codes it exists to refuse. This cannot live in the proc behaviour checks, which connect as the
-- app's EXECUTE-only login (ADR-0033, asserted by app_login.sql): a direct write is refused there
-- with 229 before any constraint runs.
USE ProjectManager;
GO
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE parent_object_id = OBJECT_ID(N'app.Financial')
                 AND name = N'CK_Financial_CurrencyCode')
    THROW 50000, N'CK_Financial_CurrencyCode is missing from app.Financial.', 1;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE parent_object_id = OBJECT_ID(N'app.Financial')
                 AND name = N'CK_Financial_CurrencyCode'
                 AND definition LIKE N'%Latin1_General_BIN%')
    THROW 50000, N'CK_Financial_CurrencyCode lost its binary collation: it now admits lower-case codes.', 1;

-- Behaviour, not only metadata, whenever the seed left a row to write to.
DECLARE @Id int = (SELECT MIN(FinancialId) FROM app.Financial);
DECLARE @Problems TABLE (Problem nvarchar(400) NOT NULL);
IF @Id IS NOT NULL
BEGIN
    DECLARE @Before nvarchar(3) = (SELECT CurrencyCode FROM app.Financial WHERE FinancialId = @Id);

    BEGIN TRY
        UPDATE app.Financial SET CurrencyCode = N'usd' WHERE FinancialId = @Id;
        INSERT @Problems VALUES (N'admitted the lower-case usd');
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() <> 547
            INSERT @Problems VALUES (CONCAT(N'usd was refused with ', ERROR_NUMBER(), N' instead of 547'));
    END CATCH;

    BEGIN TRY
        UPDATE app.Financial SET CurrencyCode = N'US1' WHERE FinancialId = @Id;
        INSERT @Problems VALUES (N'admitted US1');
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() <> 547
            INSERT @Problems VALUES (CONCAT(N'US1 was refused with ', ERROR_NUMBER(), N' instead of 547'));
    END CATCH;

    BEGIN TRY
        UPDATE app.Financial SET CurrencyCode = N'USD' WHERE FinancialId = @Id;
    END TRY
    BEGIN CATCH
        INSERT @Problems VALUES (CONCAT(N'refused the well-shaped USD with ', ERROR_NUMBER()));
    END CATCH;

    UPDATE app.Financial SET CurrencyCode = @Before WHERE FinancialId = @Id;
END;

IF EXISTS (SELECT 1 FROM @Problems)
BEGIN
    SELECT Problem FROM @Problems ORDER BY Problem;
    THROW 50000, N'CK_Financial_CurrencyCode does not behave as ADR-0051 requires (rows above).', 1;
END;

PRINT N'CK_Financial_CurrencyCode: present, binary collation intact, refuses mis-shaped codes';
GO
