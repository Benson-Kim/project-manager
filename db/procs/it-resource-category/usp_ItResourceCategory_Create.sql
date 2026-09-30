-- usp_ItResourceCategory_Create — insert one app.ItResourceCategory row; audits in-transaction; returns the new row.
-- Entity app.ItResourceCategory (source: tblITResourcePlanning). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ItResourceCategory_Create
    @ProjectId INT,
    @Resource NVARCHAR(255),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    IF @Resource IS NULL OR LTRIM(RTRIM(@Resource)) = N''
        THROW 50004, N'VALIDATION:Resource is required', 1;
    BEGIN TRAN;

    INSERT INTO app.ItResourceCategory ([ProjectId], [Resource], CreatedBy)
    VALUES (@ProjectId, @Resource, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ItResourceCategory', CAST(@Id AS NVARCHAR(64)),
            (SELECT ItResourceCategoryId, [ProjectId], [Resource]
             FROM app.ItResourceCategory WHERE ItResourceCategoryId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ItResourceCategoryId,
           [ProjectId],
           [Resource],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ItResourceCategory
    WHERE ItResourceCategoryId = @Id;
END;
GO
