-- usp_ProjectAssignee_Set — replace the FULL team of a project in one transaction (req 0.3,
-- ADR-0021), audited in-transaction. The only write path for assignments, so it owns their rules.
-- @AssigneesJson: JSON array
--   [{"role":"ProjectManager","personName":"…","userId":12,"accessLevel":"Manager"}, …]
--   * role: the title shown in the team (ProjectManager, Sponsor, BusinessAnalyst, TeamMember,
--     Stakeholder); accessLevel: what the person may do in this project (auth.AccessLevel).
--   * userId links the row to a user account; only linked rows grant access. A linked row's
--     PersonName is the user's display name. Name-only rows are kept as Viewer (no effect).
-- Row-level access: the actor needs Manager on the project (dbo.usp_Project_AssertAccess).
-- A non-Admin actor cannot remove their own Manager access (THROW 50004), so a team can never
-- lock out the person editing it.
-- Soft-deletes rows no longer present, updates or revives matches by (role, personName), inserts new ones.
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

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Manager';

    IF @AssigneesJson IS NULL OR ISJSON(@AssigneesJson) <> 1
        THROW 50004, N'VALIDATION:AssigneesJson must be a JSON array', 1;

    DECLARE @Incoming TABLE (
        [Role]        NVARCHAR(50)  NULL,
        [PersonName]  NVARCHAR(255) NULL,
        [UserId]      INT           NULL,
        [AccessLevel] NVARCHAR(20)  NULL
    );
    INSERT INTO @Incoming ([Role], [PersonName], [UserId], [AccessLevel])
    SELECT j.[Role],
           COALESCE(u.DisplayName, LTRIM(RTRIM(j.[PersonName]))),
           j.[UserId],
           CASE WHEN j.[UserId] IS NULL THEN N'Viewer' ELSE j.[AccessLevel] END
    FROM OPENJSON(@AssigneesJson)
         WITH ([Role]        NVARCHAR(50)  '$.role',
               [PersonName]  NVARCHAR(255) '$.personName',
               [UserId]      INT           '$.userId',
               [AccessLevel] NVARCHAR(20)  '$.accessLevel') AS j
    LEFT JOIN auth.[User] u ON u.UserId = j.[UserId] AND u.IsActive = 1 AND u.IsDeleted = 0;

    IF EXISTS (SELECT 1 FROM @Incoming
               WHERE [Role] IS NULL
                  OR [Role] NOT IN (N'ProjectManager', N'Sponsor', N'BusinessAnalyst', N'TeamMember', N'Stakeholder')
                  OR [PersonName] IS NULL OR [PersonName] = N'')
        THROW 50004, N'VALIDATION:Each team member needs a valid role and a name', 1;

    IF EXISTS (SELECT 1 FROM @Incoming i
               WHERE i.[UserId] IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM auth.[User] u
                                 WHERE u.UserId = i.[UserId] AND u.IsActive = 1 AND u.IsDeleted = 0))
        THROW 50004, N'VALIDATION:Each linked account must be an active user', 1;

    IF EXISTS (SELECT 1 FROM @Incoming i
               WHERE NOT EXISTS (SELECT 1 FROM auth.AccessLevel al WHERE al.Name = i.[AccessLevel]))
        THROW 50004, N'VALIDATION:Each team member needs a valid access level', 1;

    IF EXISTS (SELECT 1 FROM @Incoming GROUP BY [Role], [PersonName] HAVING COUNT(*) > 1)
        THROW 50004, N'VALIDATION:Each person can hold a role only once', 1;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole <> N'Admin'
       AND NOT EXISTS (SELECT 1 FROM @Incoming WHERE [UserId] = @ActorUserId AND [AccessLevel] = N'Manager')
        THROW 50004, N'VALIDATION:You cannot remove your own manager access', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ProjectAssigneeId, [Role], [PersonName], [UserId], [AccessLevel]
         FROM app.ProjectAssignee WHERE ProjectId = @ProjectId AND IsDeleted = 0
         FOR JSON PATH);

    -- Soft-delete assignees not in the incoming set.
    UPDATE pa SET IsDeleted = 1, DeletedAtUtc = SYSUTCDATETIME(), DeletedBy = @ActorUserId
    FROM app.ProjectAssignee pa
    WHERE pa.ProjectId = @ProjectId AND pa.IsDeleted = 0
      AND NOT EXISTS (SELECT 1 FROM @Incoming i
                      WHERE i.[Role] = pa.[Role] AND i.[PersonName] = pa.[PersonName]);

    -- Update live matches whose account link or access level changed.
    UPDATE pa SET [UserId] = i.[UserId], [AccessLevel] = i.[AccessLevel],
                  UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    FROM app.ProjectAssignee pa
    JOIN @Incoming i ON i.[Role] = pa.[Role] AND i.[PersonName] = pa.[PersonName]
    WHERE pa.ProjectId = @ProjectId AND pa.IsDeleted = 0
      AND (ISNULL(pa.[UserId], 0) <> ISNULL(i.[UserId], 0) OR pa.[AccessLevel] <> i.[AccessLevel]);

    -- Revive the latest soft-deleted match when no live row exists.
    UPDATE pa SET IsDeleted = 0, DeletedAtUtc = NULL, DeletedBy = NULL,
                  [UserId] = i.[UserId], [AccessLevel] = i.[AccessLevel],
                  UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    FROM app.ProjectAssignee pa
    JOIN @Incoming i ON i.[Role] = pa.[Role] AND i.[PersonName] = pa.[PersonName]
    WHERE pa.ProjectId = @ProjectId AND pa.IsDeleted = 1
      AND pa.ProjectAssigneeId = (SELECT MAX(d.ProjectAssigneeId) FROM app.ProjectAssignee d
                                  WHERE d.ProjectId = @ProjectId AND d.IsDeleted = 1
                                    AND d.[Role] = i.[Role] AND d.[PersonName] = i.[PersonName])
      AND NOT EXISTS (SELECT 1 FROM app.ProjectAssignee live
                      WHERE live.ProjectId = @ProjectId AND live.IsDeleted = 0
                        AND live.[Role] = i.[Role] AND live.[PersonName] = i.[PersonName]);

    -- Insert genuinely new assignees.
    INSERT INTO app.ProjectAssignee ([ProjectId], [Role], [PersonName], [UserId], [AccessLevel], CreatedBy)
    SELECT @ProjectId, i.[Role], i.[PersonName], i.[UserId], i.[AccessLevel], @ActorUserId
    FROM @Incoming i
    WHERE NOT EXISTS (SELECT 1 FROM app.ProjectAssignee pa
                      WHERE pa.ProjectId = @ProjectId AND pa.IsDeleted = 0
                        AND pa.[Role] = i.[Role] AND pa.[PersonName] = i.[PersonName]);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Set', N'app.ProjectAssignee', CAST(@ProjectId AS NVARCHAR(64)), @Before,
            (SELECT ProjectAssigneeId, [Role], [PersonName], [UserId], [AccessLevel]
             FROM app.ProjectAssignee WHERE ProjectId = @ProjectId AND IsDeleted = 0
             FOR JSON PATH));

    COMMIT;

    SELECT ProjectAssigneeId,
           [ProjectId],
           [Role],
           [PersonName],
           [UserId],
           [AccessLevel],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ProjectAssignee
    WHERE ProjectId = @ProjectId AND IsDeleted = 0
    ORDER BY [Role] ASC, [PersonName] ASC;
END;
GO
