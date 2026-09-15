-- usp_ExistingSystemInterface_Create — insert one app.ExistingSystemInterface row; audits in-transaction; returns the new row.
-- Entity app.ExistingSystemInterface (source: tblExistingSystemsInterfaces). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ExistingSystemInterface_Create
    @ProjectId INT,
    @HasInterface BIT,
    @Notes NVARCHAR(MAX) = NULL,
    @Location NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.ExistingSystemInterface ([ProjectId], [HasInterface], [Notes], [Location], CreatedBy)
    VALUES (@ProjectId, @HasInterface, @Notes, @Location, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ExistingSystemInterface', CAST(@Id AS NVARCHAR(64)),
            (SELECT ExistingSystemInterfaceId, [ProjectId], [HasInterface], [Notes], [Location]
             FROM app.ExistingSystemInterface WHERE ExistingSystemInterfaceId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ExistingSystemInterfaceId,
           [ProjectId],
           [HasInterface],
           [Notes],
           [Location],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ExistingSystemInterface
    WHERE ExistingSystemInterfaceId = @Id;
END;
GO
