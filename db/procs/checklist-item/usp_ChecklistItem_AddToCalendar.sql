-- usp_ChecklistItem_AddToCalendar — puts one or more checklist items on the to-do calendar.
-- @ChecklistItemIdsJson is a JSON array of item ids (1..200), all from one project.
-- Each item gets one to-do (title, StartDate, DueDate, the checklist's project), linked through
--   ChecklistItem.TodoItemId; an item whose linked to-do is still open keeps it, and one whose to-do is
--   Completed or Cancelled gets a new to-do, relinked. Each to-do gets one
--   all-day alert on its due date (or else its start date) for the assignee: the active user whose
--   email matches the assignee stakeholder and who can reach the project, or else the actor.
-- Access: Contributor + checklists:update and todo-items:create on the project.
-- THROW 50001 NOT_FOUND  : an item is gone.
-- An item with neither a start nor a due date is skipped.
-- THROW 50004 VALIDATION : no ids, more than 200, or items from more than one project.
-- Answers with the items (ufn_ChecklistItem_Row) plus Outcome: 'added' (a new to-do now),
--   'already' (its open to-do kept) or 'undated' (skipped). Audits every row it writes.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistItem_AddToCalendar
    @ChecklistItemIdsJson NVARCHAR(MAX),
    @ActorUserId          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Ids TABLE (Seq INT IDENTITY(1, 1) PRIMARY KEY, ChecklistItemId INT NOT NULL UNIQUE,
                        Outcome NVARCHAR(10) NULL);
    IF ISJSON(@ChecklistItemIdsJson) = 1
        INSERT INTO @Ids (ChecklistItemId)
        SELECT DISTINCT TRY_CAST(j.[value] AS INT)
        FROM OPENJSON(@ChecklistItemIdsJson) j
        WHERE TRY_CAST(j.[value] AS INT) > 0;

    DECLARE @Count INT = (SELECT COUNT(*) FROM @Ids);
    IF @Count = 0 OR @Count > 200
        THROW 50004, N'VALIDATION:Choose between 1 and 200 items', 1;

    IF EXISTS (SELECT 1 FROM @Ids x
               LEFT JOIN app.ChecklistItem i ON i.ChecklistItemId = x.ChecklistItemId AND i.IsDeleted = 0
               WHERE i.ChecklistItemId IS NULL)
        THROW 50001, N'NOT_FOUND:Item not found', 1;

    IF (SELECT COUNT(DISTINCT i.ProjectId) FROM @Ids x
        JOIN app.ChecklistItem i ON i.ChecklistItemId = x.ChecklistItemId) <> 1
        THROW 50004, N'VALIDATION:Items must come from one project', 1;

    DECLARE @ProjectId INT = (SELECT TOP (1) i.ProjectId FROM @Ids x
                              JOIN app.ChecklistItem i ON i.ChecklistItemId = x.ChecklistItemId);

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:update', @AllowProjectless = 0;
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'todo-items:create', @AllowProjectless = 0;

    BEGIN TRAN;

    UPDATE x SET Outcome = N'undated'
    FROM @Ids x
    JOIN app.ChecklistItem i WITH (UPDLOCK, HOLDLOCK) ON i.ChecklistItemId = x.ChecklistItemId
    WHERE i.IsDeleted = 0 AND i.StartDate IS NULL AND i.DueDate IS NULL;

    DECLARE @Seq INT = 1, @ItemId INT, @Title NVARCHAR(400), @Start DATE, @Due DATE,
            @StakeholderId INT, @TodoId INT, @Recipient INT;

    WHILE @Seq <= @Count
    BEGIN
        SELECT @ItemId = i.ChecklistItemId, @Title = LEFT(LTRIM(RTRIM(i.Title)), 255),
               @Start = i.StartDate, @Due = i.DueDate, @StakeholderId = i.AssigneeStakeholderId,
               @TodoId = t.TodoItemId
        FROM @Ids x
        JOIN app.ChecklistItem i ON i.ChecklistItemId = x.ChecklistItemId AND i.IsDeleted = 0
        LEFT JOIN app.TodoItem t ON t.TodoItemId = i.TodoItemId AND t.IsDeleted = 0
                                AND t.[Status] NOT IN (N'Completed', N'Cancelled')
        WHERE x.Seq = @Seq;
        IF @ItemId IS NULL
            THROW 50001, N'NOT_FOUND:Item not found', 1;
        IF @Start IS NULL AND @Due IS NULL
        BEGIN
            SELECT @ItemId = NULL, @TodoId = NULL, @Seq = @Seq + 1;
            CONTINUE;
        END;
        UPDATE @Ids SET Outcome = IIF(@TodoId IS NULL, N'added', N'already') WHERE Seq = @Seq;

        SET @Recipient = (
            SELECT TOP (1) u.UserId
            FROM app.Stakeholder s
            JOIN auth.[User] u ON u.Email = s.EmailAddress
            JOIN auth.Role r ON r.RoleId = u.RoleId
            CROSS APPLY dbo.ufn_AccessLevel_Resolve(r.[Name], u.UserId, @ProjectId, 1) a
            WHERE s.StakeholderId = @StakeholderId AND s.EmailAddress IS NOT NULL
              AND u.IsActive = 1 AND u.IsDeleted = 0 AND a.AccessLevel IS NOT NULL
            ORDER BY u.UserId);
        SET @Recipient = COALESCE(@Recipient, @ActorUserId);

        IF @TodoId IS NULL
        BEGIN
            INSERT INTO app.TodoItem ([ProjectId], [TodoItem], [StartDate], [DueDate], [Status], CreatedBy)
            VALUES (@ProjectId, COALESCE(NULLIF(@Title, N''), N'Checklist item'), @Start, @Due,
                    N'Not Started', @ActorUserId);
            SET @TodoId = SCOPE_IDENTITY();

            UPDATE app.ChecklistItem
            SET TodoItemId = @TodoId, UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
            WHERE ChecklistItemId = @ItemId;

            INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
            VALUES (@ActorUserId, N'AddToCalendar', N'app.TodoItem', CAST(@TodoId AS NVARCHAR(64)),
                    (SELECT @TodoId AS TodoItemId, @ItemId AS ChecklistItemId, @ProjectId AS ProjectId,
                            @Start AS StartDate, @Due AS DueDate
                     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        IF NOT EXISTS (SELECT 1 FROM app.TodoAlert WHERE TodoItemId = @TodoId AND IsDeleted = 0)
        BEGIN
            INSERT INTO app.TodoAlert ([TodoItemId], [AlertDay], [RecipientUserId], [IsDismissed], CreatedBy)
            VALUES (@TodoId, CAST(COALESCE(@Due, @Start) AS DATETIME2), @Recipient, 0, @ActorUserId);

            INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
            VALUES (@ActorUserId, N'Create', N'app.TodoAlert', CAST(SCOPE_IDENTITY() AS NVARCHAR(64)),
                    (SELECT @TodoId AS TodoItemId, COALESCE(@Due, @Start) AS AlertDay,
                            @Recipient AS RecipientUserId
                     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
        END;

        SELECT @ItemId = NULL, @TodoId = NULL, @Seq = @Seq + 1;
    END;

    COMMIT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT r.*, x.Outcome
    FROM @Ids x
    CROSS APPLY dbo.ufn_ChecklistItem_Row(@ActorRole, @ActorUserId, x.ChecklistItemId) r
    ORDER BY x.Seq;
END;
GO
