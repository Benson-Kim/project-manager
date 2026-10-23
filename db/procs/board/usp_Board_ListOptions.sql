-- usp_Board_ListOptions — the boards the actor may pick from, for the "Add to board..." picker and
-- the board filters. TOP 500 by name, like dbo.usp_User_ListOptions; a picker never pages.
--   @ProjectId narrows to one project's boards and must be accessible (Viewer).
--   @WithoutProject = 1 offers only standalone boards.
--   @Search filters by name; its LIKE wildcards are escaped (docs/STANDARDS.md 2.3).
-- Only boards the actor holds a level on are returned (dbo.ufn_Board_AccessLevel), and a board whose
-- project was deleted is hidden. The picker still only offers; every write re-checks the board.
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_ListOptions
    @ActorUserId    INT,
    @ProjectId      INT           = NULL,
    @Search         NVARCHAR(100) = NULL,
    @WithoutProject BIT           = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');

    SELECT TOP (500)
           b.BoardId,
           b.[Name],
           b.ProjectId,
           p.ProjectName,
           acc.AccessLevel AS ActorAccess
    FROM app.Board b
    CROSS APPLY dbo.ufn_Board_AccessLevel(@ActorRole, @ActorUserId, b.ProjectId, b.CreatedBy) acc
    LEFT JOIN app.Project p ON p.ProjectId = b.ProjectId
    WHERE b.IsDeleted = 0
      AND (b.ProjectId IS NULL OR p.IsDeleted = 0)
      AND acc.AccessLevel IS NOT NULL
      AND (@ProjectId IS NULL OR b.ProjectId = @ProjectId)
      AND (ISNULL(@WithoutProject, 0) = 0 OR b.ProjectId IS NULL)
      AND (@Search IS NULL OR b.[Name] LIKE N'%' + @Search + N'%' ESCAPE N'\')
    ORDER BY b.[Name] ASC, b.BoardId ASC;
END;
GO
