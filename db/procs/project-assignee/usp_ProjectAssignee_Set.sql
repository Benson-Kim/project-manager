-- usp_ProjectAssignee_Set — replace the FULL assignee set of a project in one
-- transaction (req 0.3 one-or-many PMs/Sponsors/BAs), audited in-transaction.
-- @AssigneesJson: JSON array [{"role":"ProjectManager","personName":"…","userId":null}, …].
-- Soft-deletes rows no longer present, revives/updates matches, inserts new ones.
-- Entity app.ProjectAssignee. Module: projects (#5).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectAssignee_Set
    @ProjectId     INT,
    @AssigneesJson NVARCHAR(MAX),
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Project WHERE ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Project not found', 1;
    IF @AssigneesJson IS NULL OR ISJSON(@AssigneesJson) <> 1
        THROW 50004, N'VALIDATION:AssigneesJson must be a JSON array', 1;

    DECLARE @Incoming TABLE (
        [Role]       NVARCHAR(50)  NOT NULL,
        [PersonName] NVARCHAR(255) NOT NULL,
        [UserId]     INT NULL
    );
    INSERT INTO @Incoming ([Role], [PersonName], [UserId])
    SELECT j.[Role], LTRIM(RTRIM(j.[PersonName])), j.[UserId]
    FROM OPENJSON(@AssigneesJson)
         WITH ([Role] NVARCHAR(50) '$.role', [PersonName] NVARCHAR(255) '$.personName', [UserId] INT '$.userId') AS j;

    IF EXISTS (SELECT 1 FROM @Incoming WHERE [Role] NOT IN (N'ProjectManager', N'Sponsor', N'BusinessAnalyst')
                                          OR [PersonName] IS NULL OR [PersonName] = N'')
        THROW 50004, N'VALIDATION:Each assignee needs a valid role and a person name', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ProjectAssigneeId, [Role], [PersonName], [UserId]
         FROM app.ProjectAssignee WHERE ProjectId = @ProjectId AND IsDeleted = 0
         FOR JSON PATH);

    -- Soft-delete assignees not in the incoming set.
    UPDATE pa SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    FROM app.ProjectAssignee pa
    WHERE pa.ProjectId = @ProjectId AND pa.IsDeleted = 0
      AND NOT EXISTS (SELECT 1 FROM @Incoming i
                      WHERE i.[Role] = pa.[Role] AND i.[PersonName] = pa.[PersonName]);

    -- Revive soft-deleted matches.
    UPDATE pa SET IsDeleted = 0, DeletedAtUtc = NULL, DeletedBy = NULL,
                  [UserId] = i.[UserId], UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    FROM app.ProjectAssignee pa
    JOIN @Incoming i ON i.[Role] = pa.[Role] AND i.[PersonName] = pa.[PersonName]
    WHERE pa.ProjectId = @ProjectId AND pa.IsDeleted = 1
      AND NOT EXISTS (SELECT 1 FROM app.ProjectAssignee live
                      WHERE live.ProjectId = @ProjectId AND live.IsDeleted = 0
                        AND live.[Role] = i.[Role] AND live.[PersonName] = i.[PersonName]);

    -- Insert genuinely new assignees.
    INSERT INTO app.ProjectAssignee ([ProjectId], [Role], [PersonName], [UserId], CreatedBy)
    SELECT @ProjectId, i.[Role], i.[PersonName], i.[UserId], @ActorUserId
    FROM @Incoming i
    WHERE NOT EXISTS (SELECT 1 FROM app.ProjectAssignee pa
                      WHERE pa.ProjectId = @ProjectId AND pa.IsDeleted = 0
                        AND pa.[Role] = i.[Role] AND pa.[PersonName] = i.[PersonName]);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Set', N'app.ProjectAssignee', CAST(@ProjectId AS NVARCHAR(64)), @Before,
            (SELECT ProjectAssigneeId, [Role], [PersonName], [UserId]
             FROM app.ProjectAssignee WHERE ProjectId = @ProjectId AND IsDeleted = 0
             FOR JSON PATH));

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
    WHERE ProjectId = @ProjectId AND IsDeleted = 0
    ORDER BY [Role] ASC, [PersonName] ASC;
END;
GO
