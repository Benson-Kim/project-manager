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
--   The card's deliverable (ADR-0052) is redacted the same way, by dbo.ufn_BoardCard_Deliverable,
--   the function the board read uses. A second result set lists the deliverable's live allocated
--   requirements for the drawer, empty unless DeliverableState is 'live'. RequirementRowVer lets
--   the sheet tick a requirement card met or set its MoSCoW without another read.
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
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0 THEN rp.Ref END AS RequirementRef,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.Requirement END AS RequirementText,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.IsMet END AS RequirementIsMet,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.ProjectId END AS RequirementProjectId,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN rq.[MoSCoW] END AS RequirementMoSCoW,
           CASE WHEN ra.AccessLevel IS NOT NULL AND rq.IsDeleted = 0
                THEN CAST(rq.RowVer AS BIGINT) END AS RequirementRowVer,
           dv.DeliverableState,
           dv.KeyDeliverableId,
           dv.DeliverableProjectId,
           dv.DeliverableTitle,
           dv.DeliverableStatus,
           dv.DeliverablePriority,
           dv.DeliverableColor,
           dv.DeliverableStartDate,
           dv.DeliverableDeadline,
           dv.DeliverableRequirementCount,
           dv.DeliverableMetCount,
           dv.DeliverableMustCount,
           dv.DeliverableMustMetCount,
           dv.DeliverableShouldCount,
           dv.DeliverableCouldCount,
           dv.DeliverableWontCount
    FROM app.BoardCard c
    LEFT JOIN app.Requirement rq ON rq.RequirementId = c.RequirementId
    OUTER APPLY dbo.ufn_Requirement_AncestorPath(rq.RequirementId) rp
    OUTER APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, rq.ProjectId, 0) ra
    CROSS APPLY dbo.ufn_BoardCard_Deliverable(c.KeyDeliverableId, @ActorRole, @ActorUserId) dv
    LEFT JOIN auth.[User] u ON u.UserId = c.AssigneeUserId
    WHERE c.BoardCardId = @BoardCardId AND c.IsDeleted = 0;

    -- The drawer's requirements, only when the first set showed the deliverable as live.
    SELECT r.RequirementId,
           r.RequirementType,
           ap.Ref,
           ap.SortPath,
           ap.Depth,
           r.ParentRequirementId,
           r.Requirement,
           r.IsMet,
           r.[MoSCoW],
           r.AcceptanceCriteria,
           r.EstimateDays,
           r.OwnerStakeholderId,
           CAST(r.RowVer AS BIGINT) AS RowVer,
           CAST(d.RowVer AS BIGINT) AS PlaceRowVer
    FROM app.BoardCard c
    CROSS APPLY dbo.ufn_BoardCard_Deliverable(c.KeyDeliverableId, @ActorRole, @ActorUserId) dv
    JOIN app.RequirementDeliverable d ON d.KeyDeliverableId = dv.KeyDeliverableId
    JOIN app.Requirement r ON r.RequirementId = d.RequirementId AND r.IsDeleted = 0
    CROSS APPLY dbo.ufn_Requirement_AncestorPath(r.RequirementId) ap
    WHERE c.BoardCardId = @BoardCardId AND c.IsDeleted = 0
      AND dv.DeliverableState = 'live'
    ORDER BY ap.SortPath, r.RequirementId;
END;
GO
