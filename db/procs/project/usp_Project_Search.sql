-- usp_Project_Search — type-ahead project search (req 0.2 / checklist row 5).
-- Prefix match on ProjectName; active rows only; capped at 20 suggestions.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Project_Search
    @Prefix      NVARCHAR(100),
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @Prefix IS NULL OR LTRIM(RTRIM(@Prefix)) = N''
        THROW 50004, N'VALIDATION:Prefix is required', 1;

    SELECT TOP (20)
           ProjectId,
           ProjectName,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Project
    WHERE IsDeleted = 0
      AND ProjectName LIKE @Prefix + N'%'
    ORDER BY ProjectName ASC;
END;
GO
