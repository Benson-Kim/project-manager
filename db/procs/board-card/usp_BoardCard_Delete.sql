-- usp_BoardCard_Delete — soft-delete one card, with an in-transaction audit row.
-- Write order (ADR-0038): lock the board row, THEN assert access, guarded by the card's RowVer.
-- Row-level access: Manager on the board with 'boards:delete' (dbo.usp_Board_AssertAccess). On a
--   standalone board that means its creator or an Admin; on a project board, a project Manager or
--   someone granted the verb by a per-person override.
-- Soft delete, so the card leaves every read (all of them filter IsDeleted = 0) while the row and
--   its audit trail stay. It also frees the card's rank and, if it was packaged, its requirement:
--   both unique indexes are filtered on IsDeleted = 0, so the requirement can be packaged again.
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_Delete
    @BoardCardId INT,
    @RowVer      BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Card not found', 1;

    BEGIN TRAN;

    DECLARE @Lock INT;
    SELECT @Lock = BoardId FROM app.Board WITH (UPDLOCK, HOLDLOCK)
    WHERE BoardId = @BoardId AND IsDeleted = 0;
    IF @Lock IS NULL
        THROW 50001, N'NOT_FOUND:Board not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'boards:delete';

    IF NOT EXISTS (SELECT 1 FROM app.BoardCard
                   WHERE BoardCardId = @BoardCardId AND IsDeleted = 0
                     AND CAST(RowVer AS BIGINT) = @RowVer)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.BoardCard WHERE BoardCardId = @BoardCardId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Card not found', 1;
        THROW 50002, N'CONFLICT:The card was changed by someone else', 1;
    END;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT BoardCardId, BoardId, BoardColumnId, BoardSprintId, RequirementId, Title, SortKey
         FROM app.BoardCard WHERE BoardCardId = @BoardCardId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.BoardCard SET
        IsDeleted = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy = @ActorUserId
    WHERE BoardCardId = @BoardCardId;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.BoardCard', CAST(@BoardCardId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
