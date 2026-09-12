USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ActivityStatus_Create
    @Name        NVARCHAR(50),
    @SortOrder   INT = 0,
    @ActorUserId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @Name IS NULL OR LTRIM(RTRIM(@Name)) = N''
    BEGIN
        THROW 50001, N'Name is required.', 1;
    END;

    INSERT INTO app.ActivityStatus (Name, SortOrder)
    VALUES (LTRIM(RTRIM(@Name)), @SortOrder);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (
        @ActorUserId,
        N'Create',
        N'app.ActivityStatus',
        CAST(@Id AS NVARCHAR(64)),
        (SELECT Name, SortOrder FROM app.ActivityStatus WHERE ActivityStatusId = @Id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    );

    SELECT @Id AS ActivityStatusId;
END;
GO
