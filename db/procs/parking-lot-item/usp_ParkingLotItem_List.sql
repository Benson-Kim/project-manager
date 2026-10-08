-- usp_ParkingLotItem_List — paged/filtered list per ADR-0016.
-- Search columns: ParkingLotItem. Sort whitelist: ParkingLotItem, IsStrikethrough.
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor is assigned to (Admin sees all). LIKE wildcards in @Search are escaped.
-- ActorAccess (ADR-0023): the actor's access level on each row's project (dbo.ufn_AccessLevel_Resolve);
--   the datasheet uses it to decide per row whether cells are editable. The cross-project filter
--   reads the same rule: a row is listed when the actor has a level on it.
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
    @IsStrikethrough BIT           = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_');

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
           acc.AccessLevel AS ActorAccess,
           TotalCount = COUNT(*) OVER ()
    FROM app.ParkingLotItem
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, ParkingLotItem.ProjectId, 0) acc
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
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
