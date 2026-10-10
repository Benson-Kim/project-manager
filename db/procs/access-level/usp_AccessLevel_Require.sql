-- usp_AccessLevel_Require — compare an effective project access level with the level an
-- operation needs (ADR-0021). Ranks come from auth.AccessLevel: Viewer < Contributor < Manager.
--   * @Level NULL (no access)            -> THROW 50003 FORBIDDEN_ROW.
--   * @Level ranks below @MinLevel       -> THROW 50003 FORBIDDEN_ROW.
--   * @MinLevel unknown (programming bug) -> THROW 51000 (INTERNAL): fails closed, never open.
-- Called by dbo.usp_Project_AssertAccess and dbo.usp_TodoItem_AssertAccess only.
-- Module: security-fixes (S1, docs/security/IDOR-getbyid-procs.md).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AccessLevel_Require
    @Level    NVARCHAR(20),
    @MinLevel NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MinRank TINYINT = (SELECT [Rank] FROM auth.AccessLevel WHERE Name = @MinLevel);
    IF @MinRank IS NULL
        THROW 51000, N'Unknown access level', 1;

    IF @Level IS NULL
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    IF ISNULL((SELECT [Rank] FROM auth.AccessLevel WHERE Name = @Level), 0) < @MinRank
        THROW 50003, N'FORBIDDEN_ROW:Your access to this project does not allow this', 1;
END;
GO
