-- ufn_BoardCard_Deliverable — what a board card may show of the deliverable it carries (ADR-0052),
-- as an inline table-valued function so dbo.usp_Board_GetBoard (every card) and
-- dbo.usp_BoardCard_GetById (one card) apply one rule. One row, always.
-- REDACTION, as for a card's requirement (ADR-0038): a standalone board may carry a deliverable from
--   a project this reader cannot see. Then DeliverableState is 'restricted' and every other column
--   is NULL. 'restricted' is decided BEFORE 'removed', so a reader without access is never told
--   whether the deliverable still exists.
-- The counts are over the live requirements allocated to the deliverable, sub-requirements
--   included: RequirementCount / MetCount ("done x/y"), MustCount / MustMetCount ("Must-haves
--   x/y"), and Must/Should/Could/WontCount, one per MoSCoW code, for the "M:1 S:2" pills and the
--   "contains" filter (a code is present when its count is above 0).
-- @ActorRole must come from dbo.usp_User_GetActorRole. Procs only; the application never calls it.
-- Reads only tables and access-level/ functions, which both appliers create before board-card/.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_BoardCard_Deliverable
(
    @KeyDeliverableId INT,
    @ActorRole        NVARCHAR(50),
    @ActorUserId      INT
)
RETURNS TABLE
AS
RETURN
    SELECT CASE WHEN @KeyDeliverableId IS NULL THEN 'none'
                WHEN da.AccessLevel IS NULL THEN 'restricted'
                WHEN kd.KeyDeliverableId IS NULL OR kd.IsDeleted = 1 THEN 'removed'
                ELSE 'live'
           END AS DeliverableState,
           CASE WHEN v.Visible = 1 THEN kd.KeyDeliverableId END AS KeyDeliverableId,
           CASE WHEN v.Visible = 1 THEN kd.ProjectId END AS DeliverableProjectId,
           CASE WHEN v.Visible = 1 THEN kd.[KeyRequirement] END AS DeliverableTitle,
           CASE WHEN v.Visible = 1 THEN kd.[Status] END AS DeliverableStatus,
           CASE WHEN v.Visible = 1 THEN kd.[Priority] END AS DeliverablePriority,
           CASE WHEN v.Visible = 1 THEN kd.Color END AS DeliverableColor,
           CASE WHEN v.Visible = 1 THEN kd.StartDate END AS DeliverableStartDate,
           CASE WHEN v.Visible = 1 THEN kd.[Deadline] END AS DeliverableDeadline,
           CASE WHEN v.Visible = 1 THEN ISNULL(rc.RequirementCount, 0) END AS DeliverableRequirementCount,
           CASE WHEN v.Visible = 1 THEN ISNULL(rc.MetCount, 0) END AS DeliverableMetCount,
           CASE WHEN v.Visible = 1 THEN ISNULL(rc.MustCount, 0) END AS DeliverableMustCount,
           CASE WHEN v.Visible = 1 THEN ISNULL(rc.MustMetCount, 0) END AS DeliverableMustMetCount,
           CASE WHEN v.Visible = 1 THEN ISNULL(rc.ShouldCount, 0) END AS DeliverableShouldCount,
           CASE WHEN v.Visible = 1 THEN ISNULL(rc.CouldCount, 0) END AS DeliverableCouldCount,
           CASE WHEN v.Visible = 1 THEN ISNULL(rc.WontCount, 0) END AS DeliverableWontCount
    FROM (SELECT @KeyDeliverableId AS Id) AS src
    LEFT JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = src.Id
    OUTER APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, kd.ProjectId, 0) AS da
    CROSS APPLY (SELECT CASE WHEN da.AccessLevel IS NOT NULL AND kd.IsDeleted = 0
                             THEN 1 ELSE 0 END AS Visible) AS v
    OUTER APPLY (
        SELECT COUNT(*) AS RequirementCount,
               SUM(CASE WHEN r.IsMet = 1 THEN 1 ELSE 0 END) AS MetCount,
               SUM(CASE WHEN r.[MoSCoW] = 'M' THEN 1 ELSE 0 END) AS MustCount,
               SUM(CASE WHEN r.[MoSCoW] = 'M' AND r.IsMet = 1 THEN 1 ELSE 0 END) AS MustMetCount,
               SUM(CASE WHEN r.[MoSCoW] = 'S' THEN 1 ELSE 0 END) AS ShouldCount,
               SUM(CASE WHEN r.[MoSCoW] = 'C' THEN 1 ELSE 0 END) AS CouldCount,
               SUM(CASE WHEN r.[MoSCoW] = 'W' THEN 1 ELSE 0 END) AS WontCount
        FROM app.RequirementDeliverable AS d
        JOIN app.Requirement AS r ON r.RequirementId = d.RequirementId AND r.IsDeleted = 0
        WHERE d.KeyDeliverableId = kd.KeyDeliverableId AND v.Visible = 1
    ) AS rc;
GO
