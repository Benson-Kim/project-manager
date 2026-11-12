-- usp_RequirementColumnOption_Rename — rename a choice (ADR-0067). The choice keeps its id, so every
--   requirement holding it, and every filter on it, follows the new name.
-- Access: Contributor + requirements:update. A stale @RowVer answers 409. Audits old and new label.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementColumnOption_Rename
    @RequirementColumnOptionId INT,
    @Label                     NVARCHAR(200),
    @RowVer                    BIGINT,
    @ActorUserId               INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @ColumnId INT, @CurrentVer BIGINT, @Old NVARCHAR(80);
    SELECT @ProjectId = o.ProjectId, @ColumnId = o.RequirementColumnId,
           @CurrentVer = CAST(o.RowVer AS BIGINT), @Old = o.Label
    FROM app.RequirementColumnOption o
    JOIN app.RequirementColumn c ON c.RequirementColumnId = o.RequirementColumnId AND c.IsDeleted = 0
    WHERE o.RequirementColumnOptionId = @RequirementColumnOptionId AND o.IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Choice not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Someone else changed this choice', 1;
    SET @Label = TRIM(@Label);
    IF @Label IS NULL OR LEN(@Label) = 0 OR LEN(@Label) > 80
        THROW 50004, N'VALIDATION:A choice has 1 to 80 characters', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = RequirementColumnId FROM app.RequirementColumn WITH (UPDLOCK, HOLDLOCK)
    WHERE RequirementColumnId = @ColumnId;

    IF EXISTS (SELECT 1 FROM app.RequirementColumnOption
               WHERE RequirementColumnId = @ColumnId AND IsDeleted = 0
                 AND RequirementColumnOptionId <> @RequirementColumnOptionId
                 AND UPPER(Label) = UPPER(@Label))
        THROW 50005, N'DUPLICATE:This list already has that choice', 1;

    UPDATE app.RequirementColumnOption SET Label = @Label, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE RequirementColumnOptionId = @RequirementColumnOptionId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Someone else changed this choice', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Rename', N'app.RequirementColumnOption', CAST(@RequirementColumnOptionId AS NVARCHAR(64)),
            (SELECT @Old AS label FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            (SELECT @Label AS label FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT RequirementColumnOptionId AS id, Label AS label, CAST(RowVer AS BIGINT) AS rowVer
    FROM app.RequirementColumnOption WHERE RequirementColumnOptionId = @RequirementColumnOptionId;
END;
GO
