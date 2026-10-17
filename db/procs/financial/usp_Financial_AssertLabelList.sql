-- usp_Financial_AssertLabelList - checks a JSON array of labels (cost categories or funding
-- sources, ADR-0029): an array of at most 200 distinct strings of 1-150 characters.
-- VALIDATION 50004 otherwise. Called by usp_FinancialTemplate_AssertDefinition and
-- usp_Financial_Update before they store a list; no data access of its own.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_AssertLabelList
    @Labels NVARCHAR(MAX),
    @What   NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Message NVARCHAR(200);

    IF @Labels IS NULL OR ISJSON(@Labels) <> 1 OR LEFT(LTRIM(@Labels), 1) <> N'['
    BEGIN
        SET @Message = N'VALIDATION:' + @What + N' must be a list';
        THROW 50004, @Message, 1;
    END;

    IF (SELECT COUNT(*) FROM OPENJSON(@Labels)) > 200
    BEGIN
        SET @Message = N'VALIDATION:' + @What + N' can hold at most 200 entries';
        THROW 50004, @Message, 1;
    END;

    IF EXISTS (SELECT 1 FROM OPENJSON(@Labels)
               WHERE [type] <> 1 OR LEN(LTRIM(RTRIM([value]))) = 0 OR LEN([value]) > 150)
    BEGIN
        SET @Message = N'VALIDATION:Each entry of ' + @What + N' must be text of 1 to 150 characters';
        THROW 50004, @Message, 1;
    END;

    IF EXISTS (SELECT LTRIM(RTRIM([value])) FROM OPENJSON(@Labels)
               GROUP BY LTRIM(RTRIM([value])) HAVING COUNT(*) > 1)
    BEGIN
        SET @Message = N'VALIDATION:' + @What + N' cannot repeat an entry';
        THROW 50004, @Message, 1;
    END;
END;
GO
