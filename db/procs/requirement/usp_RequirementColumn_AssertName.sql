-- usp_RequirementColumn_AssertName — a register column name must be 1 to 80 characters and differ,
--   ignoring case, from every other column's name in the project (ADR-0067): the built-in columns'
--   names (the project's label, else the default) and the added columns' names.
-- @BuiltInJson: [{"key":"Ref","name":"Ref"}, ...], the built-in columns' stable keys and default
--   names, from the app's one list of them (the server action passes it, never the browser).
-- @ExceptKey / @ExceptColumnId: the column being renamed, so keeping its own name is no clash.
-- Internal: runs inside the label and column write procs' transaction, after their access check,
--   under their lock on the project row.
-- THROW 50004 VALIDATION : empty, too long or no list of built-in columns. 50005 DUPLICATE : taken.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementColumn_AssertName
    @ProjectId      INT,
    @Name           NVARCHAR(200),
    @BuiltInJson    NVARCHAR(MAX),
    @ExceptKey      VARCHAR(64) = NULL,
    @ExceptColumnId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 80
        THROW 50004, N'VALIDATION:A column name has 1 to 80 characters', 1;
    IF @BuiltInJson IS NULL OR ISJSON(@BuiltInJson) = 0
        THROW 50004, N'VALIDATION:The register''s columns are missing', 1;

    IF EXISTS (
        SELECT 1
        FROM OPENJSON(@BuiltInJson) WITH ([key] VARCHAR(64) '$.key', [name] NVARCHAR(80) '$.name') b
        LEFT JOIN app.RequirementLabel l ON l.ProjectId = @ProjectId AND l.ColumnKey = b.[key]
        WHERE (@ExceptKey IS NULL OR b.[key] <> @ExceptKey)
          AND UPPER(COALESCE(l.Label, b.[name])) = UPPER(@Name))
       OR EXISTS (
        SELECT 1 FROM app.RequirementColumn
        WHERE ProjectId = @ProjectId AND IsDeleted = 0
          AND (@ExceptColumnId IS NULL OR RequirementColumnId <> @ExceptColumnId)
          AND UPPER(Name) = UPPER(@Name))
        THROW 50005, N'DUPLICATE:Another column of the register already has that name', 1;
END;
GO
