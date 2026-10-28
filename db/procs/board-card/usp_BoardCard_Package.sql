-- Package requirements atomically, with board and per-project read authorization.
-- Existing live cards are skipped. Requirements remain owned by their original register.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_BoardCard_Package
 @BoardId INT, @BoardColumnId INT, @BoardSprintId INT = NULL,
 @RequirementIds NVARCHAR(MAX), @ActorUserId INT
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 IF ISJSON(@RequirementIds) <> 1 OR LEFT(LTRIM(@RequirementIds),1) <> '['
  THROW 50004, N'VALIDATION:Select requirements', 1;
 IF EXISTS (SELECT 1 FROM OPENJSON(@RequirementIds) WHERE [type] <> 2 OR TRY_CONVERT(INT,[value]) IS NULL OR TRY_CONVERT(INT,[value]) < 1)
  THROW 50004, N'VALIDATION:Invalid requirement identifier', 1;
 DECLARE @Ids TABLE (Id INT PRIMARY KEY);
 INSERT INTO @Ids SELECT DISTINCT CONVERT(INT,[value]) FROM OPENJSON(@RequirementIds);
 IF (SELECT COUNT(*) FROM @Ids) NOT BETWEEN 1 AND 200
  THROW 50004, N'VALIDATION:Select between one and 200 requirements', 1;
 BEGIN TRAN;
 DECLARE @Lock INT, @ProjectId INT;
 SELECT @Lock=BoardId, @ProjectId=ProjectId FROM app.Board WITH (UPDLOCK,HOLDLOCK) WHERE BoardId=@BoardId AND IsDeleted=0;
 IF @Lock IS NULL THROW 50001,N'NOT_FOUND:Board not found',1;
 EXEC dbo.usp_Board_AssertAccess @BoardId=@BoardId,@ActorUserId=@ActorUserId,@MinLevel=N'Contributor',@Permission=N'boards:create';
 IF NOT EXISTS (SELECT 1 FROM app.BoardColumn WHERE BoardColumnId=@BoardColumnId AND BoardId=@BoardId AND IsDeleted=0)
  THROW 50004,N'VALIDATION:That column is not on this board',1;
 IF @BoardSprintId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.BoardSprint WHERE BoardSprintId=@BoardSprintId AND BoardId=@BoardId AND IsDeleted=0 AND [State]<>'completed')
  THROW 50004,N'VALIDATION:That sprint cannot take cards',1;
 DECLARE @Id INT, @RequirementProject INT;
 DECLARE requirements CURSOR LOCAL FAST_FORWARD FOR SELECT Id FROM @Ids ORDER BY Id;
 OPEN requirements;
 FETCH NEXT FROM requirements INTO @Id;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @RequirementProject=NULL;
  SELECT @RequirementProject=ProjectId FROM app.Requirement WITH (UPDLOCK,HOLDLOCK) WHERE RequirementId=@Id AND IsDeleted=0;
  IF @RequirementProject IS NULL THROW 50001,N'NOT_FOUND:Requirement not found',1;
  EXEC dbo.usp_Project_AssertAccess @ProjectId=@RequirementProject,@ActorUserId=@ActorUserId,@MinLevel=N'Viewer',@AllowProjectless=0;
  IF @ProjectId IS NOT NULL AND @ProjectId<>@RequirementProject
   THROW 50004,N'VALIDATION:The requirement must belong to the board project',1;
  FETCH NEXT FROM requirements INTO @Id;
 END;
 CLOSE requirements;
 DEALLOCATE requirements;
 DECLARE @Selected INT=(SELECT COUNT(*) FROM @Ids);
 DELETE i FROM @Ids i WHERE EXISTS (SELECT 1 FROM app.BoardCard c WHERE c.BoardId=@BoardId AND c.RequirementId=i.Id AND c.IsDeleted=0);
 DECLARE @Adding INT=(SELECT COUNT(*) FROM @Ids);
 EXEC dbo.usp_Board_AssertRoom @BoardId=@BoardId,@BoardColumnId=@BoardColumnId,@Adding=@Adding;
 DECLARE @Rank BIGINT=ISNULL((SELECT MAX(SortKey) FROM app.BoardCard WHERE BoardId=@BoardId AND IsDeleted=0),0);
 DECLARE @Created TABLE (BoardCardId INT, RequirementId INT);
 INSERT INTO app.BoardCard (BoardId,BoardColumnId,BoardSprintId,RequirementId,SortKey,CreatedBy)
 OUTPUT INSERTED.BoardCardId,INSERTED.RequirementId INTO @Created
 SELECT @BoardId,@BoardColumnId,@BoardSprintId,Id,@Rank+ROW_NUMBER() OVER(ORDER BY Id)*1048576,@ActorUserId FROM @Ids;
 INSERT INTO audit.AuditLog (ActorUserId,Action,EntityName,EntityId,AfterJson)
 SELECT @ActorUserId,N'Create',N'app.BoardCard',CAST(c.BoardCardId AS NVARCHAR(64)),
 (SELECT @BoardId AS BoardId,@BoardColumnId AS BoardColumnId,c.RequirementId FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)
 FROM @Created c;
 COMMIT;
 SELECT @Adding AS AddedCards,@Selected-@Adding AS SkippedCards;
END;
GO
