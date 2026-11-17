-- usp_ChecklistItem_SetDetails — set a row's dates, assignee, priority and notes in one call.
-- Access: Contributor + checklists:update. A stale @RowVer answers 409. The assignee must be a
-- stakeholder of the row's project; the caller sanitizes the notes HTML before calling.
-- A row on the calendar (live TodoItemId) also moves its to-do's dates and its alert's day, and
-- sends the alert to the new assignee's user, or else to the to-do's creator.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ChecklistItem_SetDetails
    @ChecklistItemId INT,
    @StartDate       DATE,
    @DueDate         DATE,
    @AssigneeStakeholderId INT,
    @Priority        NVARCHAR(255),
    @Notes           NVARCHAR(MAX),
    @RowVer          BIGINT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @CurrentVer BIGINT;
    SELECT @ProjectId = ProjectId, @CurrentVer = CAST(RowVer AS BIGINT)
    FROM app.ChecklistItem WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Row not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'checklists:update', @AllowProjectless = 0;

    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    IF @StartDate IS NOT NULL AND @DueDate IS NOT NULL AND @StartDate > @DueDate
        THROW 50004, N'VALIDATION:The start date must be on or before the due date', 1;

    SET @Priority = NULLIF(TRIM(@Priority), N'');
    IF LEN(@Priority) > 255
        THROW 50004, N'VALIDATION:A priority has at most 255 characters', 1;
    IF LEN(@Notes) = 0 SET @Notes = NULL;

    BEGIN TRAN;

    IF @AssigneeStakeholderId IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM app.Stakeholder
        WHERE StakeholderId = @AssigneeStakeholderId AND ProjectId = @ProjectId AND IsDeleted = 0)
        THROW 50004, N'VALIDATION:That person is not a stakeholder on this project', 1;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT StartDate, DueDate, AssigneeStakeholderId, Priority, Notes
         FROM app.ChecklistItem WHERE ChecklistItemId = @ChecklistItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

    UPDATE app.ChecklistItem
    SET StartDate = @StartDate, DueDate = @DueDate, AssigneeStakeholderId = @AssigneeStakeholderId,
        Priority = @Priority, Notes = @Notes,
        UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
    WHERE ChecklistItemId = @ChecklistItemId AND IsDeleted = 0 AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
        THROW 50002, N'CONFLICT:Row was modified by someone else', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ChecklistItem', CAST(@ChecklistItemId AS NVARCHAR(64)),
            @Before,
            (SELECT @StartDate AS StartDate, @DueDate AS DueDate, @AssigneeStakeholderId AS AssigneeStakeholderId,
                    @Priority AS Priority, @Notes AS Notes
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));

    DECLARE @TodoId INT, @TodoCreator INT;
    SELECT @TodoId = t.TodoItemId, @TodoCreator = t.CreatedBy
    FROM app.ChecklistItem i
    JOIN app.TodoItem t WITH (UPDLOCK) ON t.TodoItemId = i.TodoItemId AND t.IsDeleted = 0
    WHERE i.ChecklistItemId = @ChecklistItemId;

    IF @TodoId IS NOT NULL
    BEGIN
        UPDATE app.TodoItem
        SET StartDate = @StartDate, DueDate = @DueDate,
            UpdatedAtUtc = SYSUTCDATETIME(), UpdatedBy = @ActorUserId
        WHERE TodoItemId = @TodoId;

        DECLARE @Recipient INT = (
            SELECT TOP (1) u.UserId
            FROM app.Stakeholder s
            JOIN auth.[User] u ON u.Email = s.EmailAddress
            JOIN auth.Role r ON r.RoleId = u.RoleId
            CROSS APPLY dbo.ufn_AccessLevel_Resolve(r.[Name], u.UserId, @ProjectId, 1) a
            WHERE s.StakeholderId = @AssigneeStakeholderId AND s.EmailAddress IS NOT NULL
              AND u.IsActive = 1 AND u.IsDeleted = 0 AND a.AccessLevel IS NOT NULL
            ORDER BY u.UserId);
        DECLARE @AlertDay DATETIME2 = CAST(COALESCE(@DueDate, @StartDate) AS DATETIME2);

        UPDATE app.TodoAlert
        SET AlertDay = COALESCE(@AlertDay, AlertDay),
            IsDismissed = CASE WHEN @AlertDay IS NOT NULL AND @AlertDay <> AlertDay THEN 0 ELSE IsDismissed END,
            RecipientUserId = COALESCE(@Recipient, @TodoCreator)
        WHERE TodoItemId = @TodoId AND IsDeleted = 0;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'SyncFromChecklist', N'app.TodoItem', CAST(@TodoId AS NVARCHAR(64)),
                (SELECT @ChecklistItemId AS ChecklistItemId, @StartDate AS StartDate, @DueDate AS DueDate,
                        COALESCE(@Recipient, @TodoCreator) AS RecipientUserId
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES));
    END;

    COMMIT;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SELECT * FROM dbo.ufn_ChecklistItem_Row(@ActorRole, @ActorUserId, @ChecklistItemId);
END;
GO
