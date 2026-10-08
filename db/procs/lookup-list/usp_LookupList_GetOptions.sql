-- usp_LookupList_GetOptions — the live options of one or more dropdown lists (ADR-0022), in display
-- order, each row carrying its list's RowVer (the token dbo.usp_LookupList_Set expects back).
-- @ListKeys: JSON array of list keys, e.g. '["key-deliverable.status","key-deliverable.priority"]'.
-- A list with no live options still returns one row with NULL option columns (so its RowVer is known).
-- Any active user may read the lists (dbo.usp_User_GetActorRole rejects unknown or inactive actors).
-- Unknown keys are ignored. Entity app.LookupList / app.LookupOption. Module: lookup-lists (datasheet).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_LookupList_GetOptions
    @ActorUserId INT,
    @ListKeys    NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    IF ISJSON(@ListKeys) IS NULL OR ISJSON(@ListKeys) = 0 OR LEFT(LTRIM(@ListKeys), 1) <> N'['
        THROW 50004, N'VALIDATION:List keys must be a JSON array', 1;

    SELECT l.ListKey,
           CAST(l.RowVer AS BIGINT) AS ListRowVer,
           o.LookupOptionId,
           o.Label,
           o.SortOrder,
           o.IsLocked
    FROM app.LookupList l
    JOIN (SELECT DISTINCT CAST(k.[value] AS NVARCHAR(64)) COLLATE DATABASE_DEFAULT AS ListKey
          FROM OPENJSON(@ListKeys) k) keys ON keys.ListKey = l.ListKey
    LEFT JOIN app.LookupOption o ON o.ListKey = l.ListKey AND o.IsDeleted = 0
    ORDER BY l.ListKey, o.SortOrder, o.Label;
END;
GO
