-- usp_RequirementLinkRule_List — the allowed link pairs (ADR-0060). Any active user reads them, so a
--   picker can offer what the server will accept. The write procs still have the last word.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLinkRule_List
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole IS NULL
        THROW 50003, N'FORBIDDEN_ROW:Sign in to continue', 1;

    SELECT DownstreamType, UpstreamType
    FROM app.RequirementLinkRule
    ORDER BY DownstreamType, UpstreamType;
END;
GO
