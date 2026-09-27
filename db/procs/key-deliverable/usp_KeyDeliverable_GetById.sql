-- usp_KeyDeliverable_GetById — fetch one active app.KeyDeliverable row; THROW 50001 when absent/soft-deleted.
-- Entity app.KeyDeliverable (source: tblKeyRequirementsDeliverable). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_KeyDeliverable_GetById
    @KeyDeliverableId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.KeyDeliverable WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:KeyDeliverable not found', 1;

    SELECT KeyDeliverableId,
           [ProjectId],
           [KeyRequirement],
           [Deadline],
           [AssignedToStakeholderId],
           [Priority],
           [Status],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.KeyDeliverable
    WHERE KeyDeliverableId = @KeyDeliverableId AND IsDeleted = 0;
END;
GO
