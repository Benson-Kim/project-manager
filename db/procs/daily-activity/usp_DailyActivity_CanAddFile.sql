-- usp_DailyActivity_CanAddFile — the upload handler's pre-check (ADR-0026 §3), run BEFORE it reads
-- any byte of the body: the actor must be allowed to add files to the activity (Contributor +
-- 'daily-activities:update', ADR-0021/0024; project-less activities allowed), so nobody else can
-- make the server receive 25 MB. Returns the activity's ProjectId and the bytes its quota bucket
-- already holds (the project's live uploads; project-less rows share one bucket) so the handler can
-- refuse an upload that cannot fit. usp_DailyActivity_AddFile re-checks both authoritatively.
-- THROW 50001 NOT_FOUND (activity absent or deleted) | 50003 FORBIDDEN_ROW.
-- Entities app.DailyActivity, app.FileAttachment. Module: file-storage (F1).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_DailyActivity_CanAddFile
    @DailyActivityId INT,
    @ActorUserId     INT
AS
BEGIN
    SET NOCOUNT ON;

    EXEC dbo.usp_DailyActivity_AssertAccess
         @DailyActivityId = @DailyActivityId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'daily-activities:update';

    DECLARE @ProjectId INT =
        (SELECT ProjectId FROM app.DailyActivity WHERE DailyActivityId = @DailyActivityId);

    SELECT @ProjectId AS ProjectId,
           ISNULL((SELECT SUM(SizeBytes) FROM app.FileAttachment
                   WHERE IsDeleted = 0
                     AND (ProjectId = @ProjectId OR (@ProjectId IS NULL AND ProjectId IS NULL))), 0)
               AS UsedBytes;
END;
GO
