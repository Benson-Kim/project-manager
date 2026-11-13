-- usp_ChecklistColumn_Move — move a column one place left (@Direction -1) or right (+1) by
--   swapping places with its neighbour (ADR-0066). At either end it changes nothing.
-- Access: Contributor + checklists:update. A stale @RowVer answers 409. Answers with every column.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistColumn_Move
    @ChecklistColumnId INT,
    @Direction         INT,
    @RowVer            BIGINT,
    @ActorUserId       INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @ChecklistId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @ChecklistId = ChecklistId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.ChecklistColumn WHERE ChecklistColumnId = @ChecklistColumnId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:update', @AllowProjectless = 0;

    IF @Direction IS NULL OR @Direction NOT IN (-1, 1)
        THROW 50004, N'VALIDATION:A column moves one place at a time', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Column was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ChecklistId FROM app.Checklist WITH (UPDLOCK, HOLDLOCK) WHERE ChecklistId = @ChecklistId;
    -- A rename or delete that took the lock first has changed the version read above.
    IF NOT EXISTS (SELECT 1 FROM app.ChecklistColumn
                   WHERE ChecklistColumnId = @ChecklistColumnId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer)
        THROW 50002, N'CONFLICT:Column was modified by someone else', 1;

    -- Renumber 1..n first, so a swap is always between two distinct places.
    DECLARE @Order TABLE (ColumnId INT PRIMARY KEY, Place INT NOT NULL);
    INSERT INTO @Order (ColumnId, Place)
    SELECT ChecklistColumnId, ROW_NUMBER() OVER (ORDER BY SortOrder, ChecklistColumnId)
    FROM app.ChecklistColumn WHERE ChecklistId = @ChecklistId AND IsDeleted = 0;

    DECLARE @Place INT = (SELECT Place FROM @Order WHERE ColumnId = @ChecklistColumnId);
    DECLARE @OtherId INT = (SELECT ColumnId FROM @Order WHERE Place = @Place + @Direction);

    IF @OtherId IS NOT NULL
    BEGIN
        UPDATE @Order SET Place = @Place + @Direction WHERE ColumnId = @ChecklistColumnId;
        UPDATE @Order SET Place = @Place WHERE ColumnId = @OtherId;

        UPDATE c SET SortOrder = o.Place, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        FROM app.ChecklistColumn c JOIN @Order o ON o.ColumnId = c.ChecklistColumnId
        WHERE c.SortOrder <> o.Place OR c.ChecklistColumnId IN (@ChecklistColumnId, @OtherId);

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Move', N'app.ChecklistColumn', CAST(@ChecklistColumnId AS NVARCHAR(64)),
                (SELECT @Direction AS direction FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT ChecklistColumnId, ChecklistId, Name, Kind, ActionKind, SortOrder,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ChecklistColumn
    WHERE ChecklistId = @ChecklistId AND IsDeleted = 0
    ORDER BY SortOrder, ChecklistColumnId;
END;
GO
