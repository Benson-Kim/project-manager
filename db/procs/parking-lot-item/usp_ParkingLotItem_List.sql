-- usp_ParkingLotItem_List — paged/filtered list per ADR-0016. Search columns: ParkingLotItem. Sort whitelist: IsStrikethrough.
-- Entity app.ParkingLotItem (source: tblParkingLotItems). Module: parking-lot (#18).
-- Updated: added @IsStrikethrough filter parameter.
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
    @IsStrikethrough BIT           = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT ParkingLotItemId,
           [ProjectId],
           [ParkingLotItem],
           [StakeholderId],
           [IsStrikethrough],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.ParkingLotItem
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [ParkingLotItem] LIKE N'%' + @Search + N'%')
      AND (@IsStrikethrough IS NULL OR [IsStrikethrough] = @IsStrikethrough)
    ORDER BY
        CASE WHEN @SortBy = N'IsStrikethrough' AND @SortDir = 'asc'  THEN [IsStrikethrough] END ASC,
        CASE WHEN @SortBy = N'IsStrikethrough' AND @SortDir = 'desc' THEN [IsStrikethrough] END DESC,
        ParkingLotItemId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
