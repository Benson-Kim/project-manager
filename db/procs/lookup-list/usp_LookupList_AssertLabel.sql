-- usp_LookupList_AssertLabel — checks a value bound to a dropdown list that records store as text
-- (ADR-0022). Passes when @Label is NULL, equals a live option of @ListKey (ignoring case; @Label is
-- then rewritten to the option's exact spelling), or is unchanged from @CurrentLabel — a record keeps
-- a retired value until someone changes it. Otherwise THROW 50004 VALIDATION.
-- Callers: the Create/Update procs of every record with a text column bound to a list
-- (dbo.usp_DailyActivity_*, dbo.usp_KeyDeliverable_*). Module: lookup-lists (datasheet).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_LookupList_AssertLabel
    @ListKey      NVARCHAR(64),
    @Label        NVARCHAR(255) OUTPUT,
    @CurrentLabel NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Label IS NULL RETURN;
    IF @CurrentLabel IS NOT NULL AND @Label = @CurrentLabel COLLATE Latin1_General_100_BIN2 RETURN;

    DECLARE @Canonical NVARCHAR(50);
    SELECT @Canonical = Label
    FROM app.LookupOption
    WHERE ListKey = @ListKey AND Label = @Label AND IsDeleted = 0;

    IF @Canonical IS NULL
        THROW 50004, N'VALIDATION:Choose a value from the list', 1;

    SET @Label = @Canonical;
END;
GO
