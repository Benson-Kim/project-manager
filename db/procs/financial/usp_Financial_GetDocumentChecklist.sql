-- usp_Financial_GetDocumentChecklist — the MSSS document checklist for one
-- financial record: all 9 document types (app.FinancialDocumentType) with the
-- financial's junction state (required flag / skip reason) where one exists.
-- Port of the tblFinancials → tblProjectFinancialDocuments → tblFinancialDocuments
-- chain (qryFinancialsExtended).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Financial_GetDocumentChecklist
    @FinancialId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.Financial WHERE FinancialId = @FinancialId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:Financial not found', 1;

    SELECT dt.FinancialDocumentTypeId,
           dt.DocumentType,
           dt.SortOrder,
           fd.FinancialDocumentId,
           fd.[IsRequired],
           fd.[ReasonNotCreated],
           CAST(fd.RowVer AS BIGINT) AS RowVer
    FROM app.FinancialDocumentType AS dt
    LEFT JOIN app.FinancialDocument AS fd
        ON fd.FinancialDocumentTypeId = dt.FinancialDocumentTypeId
       AND fd.FinancialId = @FinancialId
       AND fd.IsDeleted = 0
    ORDER BY dt.SortOrder, dt.FinancialDocumentTypeId;
END;
GO
