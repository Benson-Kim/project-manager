-- usp_ProjectAssignee_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.ProjectAssignee (source: (new — req 0.3 one-or-many PMs/sponsors/BAs)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectAssignee_Update
    @ProjectAssigneeId INT,
    @ProjectId INT,
    @Role NVARCHAR(50),
    @PersonName NVARCHAR(255),
    @UserId INT = NULL,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.ProjectAssignee WHERE ProjectAssigneeId = @ProjectAssigneeId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:ProjectAssignee not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:ProjectAssignee was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ProjectAssigneeId, [ProjectId], [Role], [PersonName], [UserId]
         FROM app.ProjectAssignee WHERE ProjectAssigneeId = @ProjectAssigneeId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ProjectAssignee SET
        [ProjectId] = @ProjectId,
        [Role] = @Role,
        [PersonName] = @PersonName,
        [UserId] = @UserId,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE ProjectAssigneeId = @ProjectAssigneeId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.ProjectAssignee WHERE ProjectAssigneeId = @ProjectAssigneeId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:ProjectAssignee not found', 1;
        THROW 50002, N'CONFLICT:ProjectAssignee was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ProjectAssignee', CAST(@ProjectAssigneeId AS NVARCHAR(64)), @Before,
            (SELECT ProjectAssigneeId, [ProjectId], [Role], [PersonName], [UserId]
             FROM app.ProjectAssignee WHERE ProjectAssigneeId = @ProjectAssigneeId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ProjectAssigneeId,
           [ProjectId],
           [Role],
           [PersonName],
           [UserId],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ProjectAssignee
    WHERE ProjectAssigneeId = @ProjectAssigneeId;
END;
GO
