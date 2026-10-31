-- usp_Requirement_AssertPlanning — the rules on a requirement's planning fields (ADR-0052), in one
-- place for usp_Requirement_Create and usp_Requirement_SetPlanning. VALIDATION 50004 on a breach.
-- Run inside the caller's transaction, after its project lock, so the owner it accepts cannot be
--   deleted before the write commits.
-- @MoSCoW: NULL or one of CK_Requirement_MoSCoW's codes. The constraint backs it; checking here
--   first makes the refusal read as VALIDATION rather than INTERNAL.
-- @AcceptanceCriteria: at most 4000 characters, as the requirement text. The column is MAX so a
--   later limit change needs no migration.
-- @EstimateDays: NULL or >= 0 (CK_Requirement_EstimateDays).
-- @OwnerStakeholderId: NULL or a live stakeholder of @ProjectId. FK_Requirement_OwnerStakeholder
--   already refuses another project's stakeholder; the live check is this proc's alone.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_AssertPlanning
    @ProjectId          INT,
    @MoSCoW             CHAR(1)       = NULL,
    @AcceptanceCriteria NVARCHAR(MAX) = NULL,
    @EstimateDays       DECIMAL(6, 1) = NULL,
    @OwnerStakeholderId INT           = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @@TRANCOUNT = 0
        THROW 50004, N'VALIDATION:usp_Requirement_AssertPlanning runs inside a write', 1;

    IF @MoSCoW IS NOT NULL AND @MoSCoW NOT IN ('M', 'S', 'C', 'W')
        THROW 50004, N'VALIDATION:Pick Must, Should, Could or Won''t', 1;

    IF LEN(@AcceptanceCriteria) > 4000
        THROW 50004, N'VALIDATION:Acceptance criteria can be at most 4000 characters', 1;

    IF @EstimateDays < 0
        THROW 50004, N'VALIDATION:An estimate cannot be negative', 1;

    IF @OwnerStakeholderId IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.Stakeholder
                       WHERE StakeholderId = @OwnerStakeholderId AND ProjectId = @ProjectId
                         AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:The owner must be a stakeholder of this project', 1;
END;
GO
