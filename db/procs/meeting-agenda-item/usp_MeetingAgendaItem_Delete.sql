-- usp_MeetingAgendaItem_Delete — soft delete with rowversion concurrency (checked in the
-- transaction); the item's discussion points and every action under it are soft-deleted in the same
-- transaction, and one audit row lists them (module #10, ADR-0028). Returns ProjectId and MeetingId.
-- Access: Manager on the meeting's project, or a per-person grant (meetings:delete, ADR-0024).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_Delete
    @MeetingAgendaItemId INT,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT, @MeetingId INT;
    SELECT @RowProjectId = m.ProjectId, @MeetingId = a.MeetingId
    FROM app.MeetingAgendaItem AS a
    LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
    WHERE a.MeetingAgendaItemId = @MeetingAgendaItemId AND a.IsDeleted = 0
      AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'meetings:delete', @AllowProjectless = 0;

    BEGIN TRAN;

    IF @MeetingId IS NOT NULL
    BEGIN
        DECLARE @Locked INT;
        SELECT @Locked = MeetingId FROM app.Meeting WITH (UPDLOCK, HOLDLOCK) WHERE MeetingId = @MeetingId;
    END;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingAgendaItemId, [MeetingId], [AgendaItem], SortOrder
         FROM app.MeetingAgendaItem WHERE MeetingAgendaItemId = @MeetingAgendaItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    UPDATE app.MeetingAgendaItem SET
        IsDeleted    = 1,
        DeletedAtUtc = @Now,
        DeletedBy    = @ActorUserId
    WHERE MeetingAgendaItemId = @MeetingAgendaItemId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingAgendaItem
                       WHERE MeetingAgendaItemId = @MeetingAgendaItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;
        THROW 50002, N'CONFLICT:MeetingAgendaItem was modified by someone else', 1;
    END

    DECLARE @Points TABLE (Id INT PRIMARY KEY);
    INSERT INTO @Points (Id)
    SELECT MeetingDiscussionPointId FROM app.MeetingDiscussionPoint WHERE AgendaItemId = @MeetingAgendaItemId;

    DECLARE @Removed TABLE (Kind VARCHAR(20), Id INT);
    -- The removed actions, kept apart so the follow-up sweep below reads a table it is not also
    -- writing through OUTPUT INTO.
    DECLARE @Actions TABLE (Id INT PRIMARY KEY);

    UPDATE app.MeetingActionItem SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    OUTPUT inserted.MeetingActionItemId INTO @Actions (Id)
    WHERE IsDeleted = 0
      AND (AgendaItemId = @MeetingAgendaItemId OR DiscussionPointId IN (SELECT Id FROM @Points));

    INSERT INTO @Removed (Kind, Id) SELECT 'ActionItems', Id FROM @Actions;

    UPDATE app.MeetingDiscussionPoint SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    OUTPUT 'DiscussionPoints', inserted.MeetingDiscussionPointId INTO @Removed (Kind, Id)
    WHERE IsDeleted = 0 AND MeetingDiscussionPointId IN (SELECT Id FROM @Points);

    -- The follow-ups of those actions go with them (ADR-0041).
    UPDATE app.MeetingActionFollowUp SET IsDeleted = 1, DeletedAtUtc = @Now, DeletedBy = @ActorUserId
    OUTPUT 'ActionFollowUps', inserted.MeetingActionFollowUpId INTO @Removed (Kind, Id)
    WHERE IsDeleted = 0 AND MeetingActionItemId IN (SELECT Id FROM @Actions);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Delete', N'app.MeetingAgendaItem', CAST(@MeetingAgendaItemId AS NVARCHAR(64)), @Before,
            (SELECT a.MeetingAgendaItemId, a.IsDeleted, a.DeletedAtUtc, a.DeletedBy,
                    JSON_QUERY((SELECT Id FROM @Removed WHERE Kind = 'DiscussionPoints' FOR JSON PATH)) AS DiscussionPoints,
                    JSON_QUERY((SELECT Id FROM @Removed WHERE Kind = 'ActionItems' FOR JSON PATH)) AS ActionItems,
                    JSON_QUERY((SELECT Id FROM @Removed WHERE Kind = 'ActionFollowUps' FOR JSON PATH)) AS ActionFollowUps
             FROM app.MeetingAgendaItem AS a WHERE a.MeetingAgendaItemId = @MeetingAgendaItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT @RowProjectId AS ProjectId, @MeetingId AS MeetingId;
END;
GO
