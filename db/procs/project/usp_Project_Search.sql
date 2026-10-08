-- usp_Project_Search — type-ahead project search (req 0.2 / checklist row 5).
-- Prefix match on ProjectName; active rows only; capped at 20 suggestions.
-- Row-level access (ADR-0021): non-Admins only find projects they are assigned to.
--   LIKE wildcards in @Prefix are escaped.
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

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SET @Prefix = REPLACE(REPLACE(REPLACE(@Prefix, N'\', N'\\'), N'%', N'\%'), N'_', N'\_');

    SELECT TOP (20)
           ProjectId,
           ProjectName,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Project
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, Project.ProjectId, 0) acc
    WHERE IsDeleted = 0
      AND ProjectName LIKE @Prefix + N'%' ESCAPE N'\'
      -- Row-level access (ADR-0021): Admin sees every project; everyone else only theirs.
      AND acc.AccessLevel IS NOT NULL
    ORDER BY ProjectName ASC;
END;
GO
