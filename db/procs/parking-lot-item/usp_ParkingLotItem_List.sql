-- usp_ParkingLotItem_List — paged/filtered list per ADR-0016.
-- Search columns: ParkingLotItem. Sort whitelist: ParkingLotItem, IsStrikethrough.
-- FORBIDDEN_ROW check: when @ProjectId is supplied and actor is not Admin, verify membership.
-- LIKE wildcards in @Search are escaped to prevent wildcard injection (SEC-5).
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: parking-lot (#18).
-- ParkingLotItemId is the final tiebreaker on every sort path to guarantee stable
-- OFFSET paging when two rows share the same sort-key value.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ParkingLotItem_List
    @ActorUserId     INT,
    @ProjectId       INT           = NULL,
    @Search          NVARCHAR(100) = NULL,
    @SortBy          NVARCHAR(50)  = NULL,
    @SortDir         VARCHAR(4)    = 'asc',
    @Page            INT           = 1,
    @PageSize        INT           = 25,
    @IsStrikethrough BIT           = NULL,
    @ActorRole       NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    -- Project-scope membership check: non-Admin actors may only list items for
    -- projects they are assigned to. Cross-project enumeration is not permitted.
    IF @ProjectId IS NOT NULL AND ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @ProjectId AND UserId = @ActorUserId AND IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    -- Escape LIKE special characters in the search term to prevent wildcard injection.
    IF @Search IS NOT NULL
    BEGIN
        SET @Search = REPLACE(@Search, N'\', N'\\');
        SET @Search = REPLACE(@Search, N'%', N'\%');
        SET @Search = REPLACE(@Search, N'_', N'\_');
    END

    SELECT ParkingLotItemId,
           [ProjectId],
           [ParkingLotItem],
           [StakeholderId],
           [IsStrikethrough],
           [FollowUpActions],
           [Owner],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.ParkingLotItem
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [ParkingLotItem] LIKE N'%' + @Search + N'%' ESCAPE N'\')
      AND (@IsStrikethrough IS NULL OR [IsStrikethrough] = @IsStrikethrough)
    ORDER BY
        CASE WHEN @SortBy = N'ParkingLotItem'   AND @SortDir = 'asc'  THEN [ParkingLotItem] END ASC,
        CASE WHEN @SortBy = N'ParkingLotItem'   AND @SortDir = 'desc' THEN [ParkingLotItem] END DESC,
        CASE WHEN @SortBy = N'IsStrikethrough'  AND @SortDir = 'asc'  THEN [IsStrikethrough] END ASC,
        CASE WHEN @SortBy = N'IsStrikethrough'  AND @SortDir = 'desc' THEN [IsStrikethrough] END DESC,
        [ParkingLotItem] ASC,
        ParkingLotItemId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
