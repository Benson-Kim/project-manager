-- usp_ProjectAssignee_Create — insert one app.ProjectAssignee row; audits in-transaction; returns the new row.
-- Entity app.ProjectAssignee (source: (new — req 0.3 one-or-many PMs/sponsors/BAs)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ProjectAssignee_Create
    @ProjectId INT,
    @Role NVARCHAR(50),
    @PersonName NVARCHAR(255),
    @UserId INT = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    IF @Role IS NULL OR LTRIM(RTRIM(@Role)) = N''
        THROW 50004, N'VALIDATION:Role is required', 1;
    IF @PersonName IS NULL OR LTRIM(RTRIM(@PersonName)) = N''
        THROW 50004, N'VALIDATION:PersonName is required', 1;
    BEGIN TRAN;

    INSERT INTO app.ProjectAssignee ([ProjectId], [Role], [PersonName], [UserId], CreatedBy)
    VALUES (@ProjectId, @Role, @PersonName, @UserId, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ProjectAssignee', CAST(@Id AS NVARCHAR(64)),
            (SELECT ProjectAssigneeId, [ProjectId], [Role], [PersonName], [UserId]
             FROM app.ProjectAssignee WHERE ProjectAssigneeId = @Id
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
    WHERE ProjectAssigneeId = @Id;
END;
GO
