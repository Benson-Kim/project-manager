-- usp_ChecklistItem_List — one page of a checklist's rows with their cells (ADR-0066, list contract
--   ADR-0016). Search: Title. Sort whitelist: Title; otherwise the rows' own order.
-- Row-level access: the checklist's project must be accessible at Viewer. Rows are paged before the
--   cells are read, so a page costs the same however long the checklist is.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistItem_List
    @ChecklistId INT,
    @ActorUserId INT,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ProjectId INT =
        (SELECT ProjectId FROM app.Checklist WHERE ChecklistId = @ChecklistId AND IsDeleted = 0);
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Checklist not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Viewer', @AllowProjectless = 0;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;
    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

    WITH ordered AS (
        SELECT i.ChecklistItemId,
               Place = ROW_NUMBER() OVER (ORDER BY
                   CASE WHEN @SortBy = N'Title' AND @SortDir = 'asc'  THEN i.Title END ASC,
                   CASE WHEN @SortBy = N'Title' AND @SortDir = 'desc' THEN i.Title END DESC,
                   i.SortOrder ASC, i.ChecklistItemId ASC),
               TotalCount = COUNT(*) OVER ()
        FROM app.ChecklistItem i
        WHERE i.ChecklistId = @ChecklistId AND i.IsDeleted = 0
          AND (@Search IS NULL OR i.Title LIKE N'%' + @Search + N'%' ESCAPE N'\')
    )
    SELECT r.*, o.TotalCount
    FROM ordered o
    CROSS APPLY dbo.ufn_ChecklistItem_Row(@ActorRole, @ActorUserId, o.ChecklistItemId) r
    WHERE o.Place > (@Page - 1) * @PageSize AND o.Place <= @Page * @PageSize
    ORDER BY o.Place;
END;
GO
