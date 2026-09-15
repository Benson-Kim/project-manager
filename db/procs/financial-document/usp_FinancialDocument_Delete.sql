-- usp_FinancialDocument_Delete — soft delete with rowversion concurrency + in-transaction audit.
-- Entity app.FinancialDocument (source: tblProjectFinancialDocuments). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_Delete
    @FinancialDocumentId INT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.FinancialDocument WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:FinancialDocument not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:FinancialDocument was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT FinancialDocumentId, [FinancialId], [FinancialDocumentTypeId], [IsRequired], [ReasonNotCreated]
         FROM app.FinancialDocument WHERE FinancialDocumentId = @FinancialDocumentId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.FinancialDocument SET
        IsDeleted    = 1,
        DeletedAtUtc = SYSUTCDATETIME(),
        DeletedBy    = @ActorUserId
    WHERE FinancialDocumentId = @FinancialDocumentId AND IsDeleted = 0;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson)
    VALUES (@ActorUserId, N'Delete', N'app.FinancialDocument', CAST(@FinancialDocumentId AS NVARCHAR(64)), @Before);

    COMMIT;
END;
GO
