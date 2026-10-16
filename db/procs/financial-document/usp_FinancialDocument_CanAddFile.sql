-- usp_FinancialDocument_CanAddFile - the upload handler's pre-check (ADR-0026 section 3, ADR-0030),
-- run BEFORE it reads any byte of the body: the actor must be allowed to add files to the document
-- (Manager + 'financials:update' on the financial's project, ADR-0021/0024), so nobody else can make
-- the server receive 25 MB. Returns the project and the bytes its quota bucket already holds so the
-- handler can refuse an upload that cannot fit. usp_FinancialDocument_AddFile re-checks both.
-- THROW 50001 NOT_FOUND (document or financial absent or deleted) | 50003 FORBIDDEN_ROW.
-- Entities app.FinancialDocument, app.FileAttachment.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_CanAddFile
    @FinancialDocumentId INT,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FinancialId INT;
    EXEC dbo.usp_FinancialDocument_AssertAccess
         @FinancialDocumentId = @FinancialDocumentId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'financials:update', @FinancialId = @FinancialId OUTPUT;

    DECLARE @ProjectId INT = (SELECT ProjectId FROM app.Financial WHERE FinancialId = @FinancialId);

    SELECT @ProjectId AS ProjectId,
           ISNULL((SELECT SUM(SizeBytes) FROM app.FileAttachment
                   WHERE IsDeleted = 0 AND ProjectId = @ProjectId), 0) AS UsedBytes;
END;
GO
