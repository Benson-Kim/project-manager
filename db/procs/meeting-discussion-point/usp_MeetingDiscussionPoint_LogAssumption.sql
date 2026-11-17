-- usp_MeetingDiscussionPoint_LogAssumption — logs a meeting's discussion point as an assumption in
--   the project's assumptions register and links the point to it, in one transaction (078).
--   The point's rich text becomes the row's description, with Type 'Assumption' from its list.
--   A point already linked to a live row returns that row unchanged, so a double click never logs
--   it twice.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_MeetingDiscussionPoint_LogAssumption
    @MeetingDiscussionPointId INT,
    @RowVer                   BIGINT,
    @ActorUserId              INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @MeetingId INT, @Text NVARCHAR(MAX);
    SELECT @ProjectId = m.ProjectId, @MeetingId = m.MeetingId, @Text = dp.DiscussionPoint
    FROM app.MeetingDiscussionPoint AS dp
    JOIN app.MeetingAgendaItem AS a ON a.MeetingAgendaItemId = dp.AgendaItemId AND a.IsDeleted = 0
    JOIN app.Meeting AS m ON m.MeetingId = a.MeetingId AND m.IsDeleted = 0
    WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId AND dp.IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'meetings:update', @AllowProjectless = 0;
    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'assumptions-constraints:create', @AllowProjectless = 0;

    DECLARE @Type NVARCHAR(255) = N'Assumption';
    EXEC dbo.usp_LookupList_AssertLabel
         @ListKey = N'assumption-constraint.type', @Label = @Type OUTPUT;

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    BEGIN TRAN;

    DECLARE @CurrentVer BIGINT, @LinkedId INT;
    SELECT @CurrentVer = CAST(dp.RowVer AS BIGINT), @LinkedId = ac.AssumptionConstraintId
    FROM app.MeetingDiscussionPoint AS dp WITH (UPDLOCK, HOLDLOCK)
    LEFT JOIN app.AssumptionConstraint AS ac
        ON ac.AssumptionConstraintId = dp.AssumptionConstraintId AND ac.IsDeleted = 0
    WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId AND dp.IsDeleted = 0;
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:MeetingDiscussionPoint not found', 1;

    IF @LinkedId IS NULL
    BEGIN
        IF @CurrentVer <> @RowVer
            THROW 50002, N'CONFLICT:The discussion point was changed by someone else', 1;

        INSERT INTO app.AssumptionConstraint ([ProjectId], [Type], [Description], [IsValidated], CreatedBy)
        VALUES (@ProjectId, @Type, @Text, 0, @ActorUserId);
        SET @LinkedId = SCOPE_IDENTITY();

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Create', N'app.AssumptionConstraint', CAST(@LinkedId AS NVARCHAR(64)),
                (SELECT AssumptionConstraintId, [ProjectId], [Type], [Description],
                        @MeetingDiscussionPointId AS FromDiscussionPointId
                 FROM app.AssumptionConstraint WHERE AssumptionConstraintId = @LinkedId
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

        UPDATE app.MeetingDiscussionPoint
        SET AssumptionConstraintId = @LinkedId, UpdatedAtUtc = @Now, UpdatedBy = @ActorUserId
        WHERE MeetingDiscussionPointId = @MeetingDiscussionPointId;

        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
        VALUES (@ActorUserId, N'Update', N'app.MeetingDiscussionPoint',
                CAST(@MeetingDiscussionPointId AS NVARCHAR(64)),
                (SELECT @MeetingDiscussionPointId AS MeetingDiscussionPointId,
                        @LinkedId AS AssumptionConstraintId
                 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END;

    COMMIT;

    SELECT @ProjectId AS ProjectId, @MeetingId AS MeetingId, dp.AssumptionConstraintId,
           CAST(dp.RowVer AS BIGINT) AS RowVer
    FROM app.MeetingDiscussionPoint AS dp
    WHERE dp.MeetingDiscussionPointId = @MeetingDiscussionPointId;
END;
GO
