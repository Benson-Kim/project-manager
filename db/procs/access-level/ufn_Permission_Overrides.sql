-- ufn_Permission_Overrides — the actor's per-person overrides (ADR-0024) for one section of one
-- project, as two comma lists of verbs: Grants (allowed despite the level) and Revokes (refused
-- despite it). Both NULL for Admins, project-less rows and people without overrides. The list procs
-- return them per row (ActorGrants / ActorRevokes) so the datasheet gates cells exactly as
-- dbo.usp_Permission_Require will. Inline, so it costs one seek per row. Module: access (ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_Permission_Overrides
(
    @ActorRole   NVARCHAR(50),
    @ActorUserId INT,
    @ProjectId   INT,
    @Module      NVARCHAR(50)
)
RETURNS TABLE
AS
RETURN
    SELECT Grants  = STRING_AGG(CASE WHEN o.Allowed = 1 THEN CAST(o.Verb AS NVARCHAR(10)) END, N','),
           Revokes = STRING_AGG(CASE WHEN o.Allowed = 0 THEN CAST(o.Verb AS NVARCHAR(10)) END, N',')
    FROM app.ProjectPermissionOverride o
    WHERE o.ProjectId = @ProjectId
      AND o.UserId = @ActorUserId
      AND o.[Module] = @Module
      AND ISNULL(@ActorRole, N'') <> N'Admin';
GO
