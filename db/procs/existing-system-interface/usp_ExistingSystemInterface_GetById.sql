-- usp_ExistingSystemInterface_GetById — fetch one active app.ExistingSystemInterface row; THROW 50001 when absent/soft-deleted.
-- Entity app.ExistingSystemInterface (source: tblExistingSystemsInterfaces). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ExistingSystemInterface_GetById
    @ExistingSystemInterfaceId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.ExistingSystemInterface WHERE ExistingSystemInterfaceId = @ExistingSystemInterfaceId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:ExistingSystemInterface not found', 1;

    SELECT ExistingSystemInterfaceId,
           [ProjectId],
           [HasInterface],
           [Notes],
           [Location],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ExistingSystemInterface
    WHERE ExistingSystemInterfaceId = @ExistingSystemInterfaceId AND IsDeleted = 0;
END;
GO
