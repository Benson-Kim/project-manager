-- usp_Board_GetById — one board for its page, with the actor's standing on it.
-- Row-level access: dbo.usp_Board_AssertAccess at Viewer — 50001 when the board or its project is
--   missing or deleted, 50003 when the actor holds no level on it.
-- ActorAccess / ActorGrants / ActorRevokes (ADR-0016, ADR-0024) let the page offer exactly what the
--   write procs will allow. Reads never pass a permission, so an override cannot widen a read.
-- Entity app.Board. Module: boards (ADR-0038).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Board_GetById
    @BoardId     INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_Board_AssertAccess
         @BoardId = @BoardId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;

    SELECT b.BoardId,
           b.ProjectId,
           p.ProjectName,
           b.[Name],
           b.[Description],
           b.CreatedBy,
           b.CreatedAtUtc,
           b.UpdatedAtUtc,
           CAST(b.RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes
    FROM app.Board b
    CROSS APPLY dbo.ufn_Board_AccessLevel(@ActorRole, @ActorUserId, b.ProjectId, b.CreatedBy) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, b.ProjectId, N'boards') ov
    LEFT JOIN app.Project p ON p.ProjectId = b.ProjectId
    WHERE b.BoardId = @BoardId AND b.IsDeleted = 0;
END;
GO
