-- usp_ItResourceItem_GetById — fetch one active app.ItResourceItem row; THROW 50001 when absent/soft-deleted.
-- Entity app.ItResourceItem (source: tblITResourcePlanningDetails). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ItResourceItem_GetById
    @ItResourceItemId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.ItResourceItem WHERE ItResourceItemId = @ItResourceItemId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:ItResourceItem not found', 1;

    SELECT ItResourceItemId,
           [ItResourceCategoryId],
           [DetailText],
           [Needed],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ItResourceItem
    WHERE ItResourceItemId = @ItResourceItemId AND IsDeleted = 0;
END;
GO
