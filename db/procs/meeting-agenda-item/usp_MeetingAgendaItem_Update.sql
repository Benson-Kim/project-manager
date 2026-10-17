-- usp_MeetingAgendaItem_Update — change an agenda item's text with rowversion concurrency (50002
-- CONFLICT, checked in the transaction) and an in-transaction audit row (module #10, ADR-0028).
-- The meeting and the position are immutable here (moves go through usp_MeetingAgendaItem_Reorder).
-- Access: Contributor on the meeting's project, or a per-person grant (meetings:update, ADR-0024).
-- VALIDATION 50004: empty AgendaItem.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingAgendaItem_Update
    @MeetingAgendaItemId INT,
    @AgendaItem          NVARCHAR(MAX) = NULL,
    @RowVer              BIGINT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = m.ProjectId
    FROM app.MeetingAgendaItem AS a
    LEFT JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId
    WHERE a.MeetingAgendaItemId = @MeetingAgendaItemId AND a.IsDeleted = 0
      AND (a.MeetingId IS NULL OR m.IsDeleted = 0);
    IF @@ROWCOUNT = 0
        THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;

    IF NULLIF(TRIM(@AgendaItem), N'') IS NULL
        THROW 50004, N'VALIDATION:AgendaItem is required', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT MeetingAgendaItemId, [MeetingId], [AgendaItem], SortOrder
         FROM app.MeetingAgendaItem WHERE MeetingAgendaItemId = @MeetingAgendaItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.MeetingAgendaItem SET
        [AgendaItem] = @AgendaItem,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE MeetingAgendaItemId = @MeetingAgendaItemId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.MeetingAgendaItem
                       WHERE MeetingAgendaItemId = @MeetingAgendaItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:MeetingAgendaItem not found', 1;
        THROW 50002, N'CONFLICT:MeetingAgendaItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.MeetingAgendaItem', CAST(@MeetingAgendaItemId AS NVARCHAR(64)), @Before,
            (SELECT MeetingAgendaItemId, [MeetingId], [AgendaItem], SortOrder
             FROM app.MeetingAgendaItem WHERE MeetingAgendaItemId = @MeetingAgendaItemId
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT MeetingAgendaItemId,
           [MeetingId],
           [AgendaItem],
           SortOrder,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           @RowProjectId AS ProjectId
    FROM app.MeetingAgendaItem
    WHERE MeetingAgendaItemId = @MeetingAgendaItemId;
END;
GO
