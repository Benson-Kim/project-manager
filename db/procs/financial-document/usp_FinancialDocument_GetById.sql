-- usp_FinancialDocument_GetById — fetch one active app.FinancialDocument row; THROW 50001 when absent/soft-deleted.
-- Entity app.FinancialDocument (source: tblProjectFinancialDocuments). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_GetById
    @FinancialDocumentId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.FinancialDocument WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:FinancialDocument not found', 1;

    SELECT FinancialDocumentId,
           [FinancialId],
           [FinancialDocumentTypeId],
           [IsRequired],
           [ReasonNotCreated],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.FinancialDocument
    WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0;
END;
GO
