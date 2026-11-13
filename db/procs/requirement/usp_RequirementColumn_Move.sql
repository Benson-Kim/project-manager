-- usp_RequirementColumn_Move — move an added register column one place left (@Direction -1) or
--   right (+1) among the added columns (ADR-0067). At either end it changes nothing.
-- Access: Contributor + requirements:update. A stale @RowVer answers 409.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementColumn_Move
    @RequirementColumnId INT,
    @Direction           INT,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.RequirementColumn WHERE RequirementColumnId = @RequirementColumnId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @Direction IS NULL OR @Direction NOT IN (-1, 1)
        THROW 50004, N'VALIDATION:A column moves one place at a time', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @ProjectId;
    -- A rename or delete that took the lock first has changed the version read above.
    IF NOT EXISTS (SELECT 1 FROM app.RequirementColumn
                   WHERE RequirementColumnId = @RequirementColumnId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer)
        THROW 50002, N'CONFLICT:Someone else changed this column', 1;

    DECLARE @Order TABLE (ColumnId INT PRIMARY KEY, Place INT NOT NULL);
    INSERT INTO @Order (ColumnId, Place)
    SELECT RequirementColumnId, ROW_NUMBER() OVER (ORDER BY SortOrder, RequirementColumnId)
    FROM app.RequirementColumn WHERE ProjectId = @ProjectId AND IsDeleted = 0;

    DECLARE @Place INT = (SELECT Place FROM @Order WHERE ColumnId = @RequirementColumnId);
    DECLARE @OtherId INT = (SELECT ColumnId FROM @Order WHERE Place = @Place + @Direction);

    IF @OtherId IS NOT NULL
    BEGIN
        UPDATE @Order SET Place = @Place + @Direction WHERE ColumnId = @RequirementColumnId;
        UPDATE @Order SET Place = @Place WHERE ColumnId = @OtherId;

        UPDATE c SET SortOrder = o.Place, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        FROM app.RequirementColumn c JOIN @Order o ON o.ColumnId = c.RequirementColumnId
        WHERE c.SortOrder <> o.Place OR c.RequirementColumnId IN (@RequirementColumnId, @OtherId);

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Move', N'app.RequirementColumn', CAST(@RequirementColumnId AS NVARCHAR(64)),
                (SELECT @Direction AS direction FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT RequirementColumnId, Name, Kind, SortOrder, CAST(RowVer AS BIGINT) AS RowVer
    FROM app.RequirementColumn WHERE ProjectId = @ProjectId AND IsDeleted = 0
    ORDER BY SortOrder, RequirementColumnId;
END;
GO
