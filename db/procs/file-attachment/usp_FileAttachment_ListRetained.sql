-- usp_FileAttachment_ListRetained — the stored files the orphan sweep must keep (ADR-0026 §5): the
-- distinct hashes that a live attachment uses, or one deleted less than @GraceDays ago (so a restore
-- within the grace period still finds its bytes). src/lib/files/sweep.ts deletes every other stored
-- file older than the grace period. Covers every owner: the hashes live on app.FileAttachment.
-- Admin only (the sweep is a maintenance action): THROW 50003 FORBIDDEN_ROW for anyone else.
-- Entity app.FileAttachment. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FileAttachment_ListRetained
    @GraceDays   INT = 30,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole <> N'Admin'
        THROW 50003, N'FORBIDDEN_ROW:Only an administrator can sweep stored files', 1;
    IF @GraceDays IS NULL OR @GraceDays < 1
        THROW 50004, N'VALIDATION:The grace period must be at least one day', 1;

    DECLARE @Since DATETIME2 = DATEADD(DAY, -@GraceDays, SYSUTCDATETIME());

    SELECT DISTINCT Sha256
    FROM app.FileAttachment
    WHERE Sha256 IS NOT NULL
      AND (IsDeleted = 0 OR DeletedAtUtc IS NULL OR DeletedAtUtc > @Since);
END;
GO
