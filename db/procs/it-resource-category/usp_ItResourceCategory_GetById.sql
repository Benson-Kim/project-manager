-- usp_ItResourceCategory_GetById — fetch one active app.ItResourceCategory row; THROW 50001 when absent/soft-deleted.
-- Entity app.ItResourceCategory (source: tblITResourcePlanning). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ItResourceCategory_GetById
    @ItResourceCategoryId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.ItResourceCategory WHERE ItResourceCategoryId = @ItResourceCategoryId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:ItResourceCategory not found', 1;

    SELECT ItResourceCategoryId,
           [ProjectId],
           [Resource],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ItResourceCategory
    WHERE ItResourceCategoryId = @ItResourceCategoryId AND IsDeleted = 0;
END;
GO
