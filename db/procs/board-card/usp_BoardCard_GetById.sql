-- usp_BoardCard_GetById — one card for the card sheet, including its rich-text Notes, which the
-- board read deliberately leaves out (it would carry every card's notes for a view that shows
-- none of them).
-- Row-level access: dbo.usp_Board_AssertAccess at Viewer, on the board the card belongs to — the
--   board is the access scope, so a card id from a board the actor cannot reach answers 50003 and
--   never its contents. A read passes no @Permission, so an override cannot widen it.
-- REDACTION, identical to dbo.usp_Board_GetBoard: a card may carry a requirement from a project
--   this reader cannot see. Then RequirementState is 'restricted' and every requirement column is
--   NULL. 'restricted' is decided before 'removed', so a reader without access is not told whether
--   the requirement still exists. Opening the sheet must not reveal what the board hid.
-- Entity app.BoardCard. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_GetById
    @BoardCardId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @BoardId INT;
    SELECT @BoardId = BoardId FROM app.BoardCard
    WHERE BoardCardId = @BoardCardId AND IsDeleted = 0;
    IF @BoardId IS NULL
        THROW 50001, N'NOT_FOUND:Card not found', 1;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    SELECT c.BoardCardId,
           c.BoardId,
           c.BoardColumnId,
           c.BoardSprintId,
           c.Title,
           c.Notes,
           c.AssigneeUserId,
           u.DisplayName AS AssigneeName,
           c.DueDate,
           c.StoryPoints,
           c.Color,
           c.SortKey,
           c.CreatedBy,
           c.CreatedAtUtc,
           c.UpdatedAtUtc,
           CAST(c.RowVer AS BIGINT) AS RowVer,
           CASE WHEN c.RequirementId IS NULL THEN 'none'
                WHEN ra.AccessLevel IS NULL THEN 'restricted'
                WHEN rq.RequirementId IS NULL OR rq.IsDeleted = 1 THEN 'removed'
                ELSE 'live'
           END AS RequirementState,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN c.RequirementId END AS RequirementId,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.RequirementType END AS RequirementType,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.Number END AS RequirementNumber,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.Requirement END AS RequirementText,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.IsMet END AS RequirementIsMet,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.ProjectId END AS RequirementProjectId
    FROM app.BoardCard c
    LEFT JOIN app.Requirement rq ON rq.RequirementId = c.RequirementId
    OUTER APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, rq.ProjectId, 0) ra
    LEFT JOIN auth.[User] u ON u.UserId = c.AssigneeUserId
    WHERE c.BoardCardId = @BoardCardId AND c.IsDeleted = 0;
END;
GO
