-- usp_RequirementCanvas_AssertDetails — the rules a canvas's name and filing meet (ADR-0061).
-- Internal: usp_RequirementCanvas_Create and _Update call it after their own access check, inside
--   their transaction and the project lock, so two writes cannot pass the name check together.
--   It asserts no access itself, is named in EXEMPT in src/tests/proc-access-levels.test.ts, and
--   a guardrail fails if any TS file calls it. A WBS item that is missing and one in another
--   project answer alike, so an id cannot be probed.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvas_AssertDetails
    @ProjectId           INT,
    @RequirementCanvasId INT = NULL,
    @Name                NVARCHAR(200),
    @KeyDeliverableId    INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:Canvas details are only checked inside a canvas write', 1;

    IF @Name IS NULL OR LEN(@Name) = 0 OR LEN(@Name) > 120
        THROW 50004, N'VALIDATION:Enter a canvas name of up to 120 characters', 1;

    IF @KeyDeliverableId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.KeyDeliverable
                       WHERE KeyDeliverableId = @KeyDeliverableId
                         AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:A deliverable was not found', 1;

    IF EXISTS (SELECT 1 FROM app.RequirementCanvas
               WHERE ProjectId = @ProjectId AND IsDeleted = 0 AND Name = @Name
                 AND (@RequirementCanvasId IS NULL OR RequirementCanvasId <> @RequirementCanvasId))
        THROW 50005, N'DUPLICATE:A canvas with this name already exists', 1;
END;
GO
