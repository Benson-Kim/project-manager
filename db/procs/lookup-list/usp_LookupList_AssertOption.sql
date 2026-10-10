-- usp_LookupList_AssertOption — checks a value bound to a dropdown list that records store by option
-- id (ADR-0022; today app.DailyActivity.ActivityStatusId). Passes when @LookupOptionId is NULL, is a
-- live option of @ListKey, or is unchanged from @CurrentOptionId — a record keeps a retired option
-- until someone changes it. Otherwise THROW 50004 VALIDATION (the FK alone would accept an option of
-- another list). Callers: dbo.usp_DailyActivity_Create/Update. Module: lookup-lists (datasheet).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_LookupList_AssertOption
    @ListKey         NVARCHAR(64),
    @LookupOptionId  INT,
    @CurrentOptionId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @LookupOptionId IS NULL OR @LookupOptionId = @CurrentOptionId RETURN;

    IF NOT EXISTS (SELECT 1 FROM app.LookupOption
                   WHERE LookupOptionId = @LookupOptionId AND ListKey = @ListKey AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:Choose a value from the list', 1;
END;
GO
