-- usp_ProjectAssignee_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.ProjectAssignee (source: (new — req 0.3 one-or-many PMs/sponsors/BAs)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectAssignee_Delete
    @ProjectAssigneeId INT,
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
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE ProjectAssigneeId = @ProjectAssigneeId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.ProjectAssignee WHERE ProjectAssigneeId = @ProjectAssigneeId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:ProjectAssignee not found', 1;
        THROW 50002, N'CONFLICT:ProjectAssignee was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.ProjectAssignee', CAST(@ProjectAssigneeId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
