-- usp_Requirement_SetMoSCoW — set or clear one requirement's MoSCoW priority (ADR-0052); answers
-- with the row. The one-click chips on the work breakdown, the Gantt panel and the Kanban drawer
-- call this, so a chip never rewrites the wording, links or planning fields it did not show.
-- @MoSCoW is required: NULL clears it ("not prioritised yet").
-- Access: Contributor + requirements:update. CONFLICT 50002 on a stale RowVer.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Requirement_SetMoSCoW
    @RequirementId INT,
    @MoSCoW        CHAR(1),
    @RowVer        BIGINT,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT, @RowProjectId INT, @OldMoSCoW CHAR(1);
    SELECT @CurrentVer = CAST(RowVer AS BIGINT), @RowProjectId = ProjectId, @OldMoSCoW = [MoSCoW]
    FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:Requirement not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = ProjectId FROM app.Project WITH (UPDLOCK, HOLDLOCK) WHERE ProjectId = @RowProjectId;

    EXEC dbo.usp_Requirement_AssertPlanning @ProjectId = @RowProjectId, @MoSCoW = @MoSCoW;

    UPDATE app.Requirement SET
        [MoSCoW]     = @MoSCoW,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE RequirementId = @RequirementId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.Requirement WHERE RequirementId = @RequirementId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:Requirement not found', 1;
        THROW 50002, N'CONFLICT:Requirement was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.Requirement', CAST(@RequirementId AS NVARCHAR(64)),
            (SELECT @OldMoSCoW AS [MoSCoW] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES),
            (SELECT @MoSCoW AS [MoSCoW] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    COMMIT;

    EXEC dbo.usp_Requirement_GetById @RequirementId = @RequirementId, @ActorUserId = @ActorUserId;
END;
GO
