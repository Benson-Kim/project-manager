-- usp_FinancialDocument_Create — insert one app.FinancialDocument row; audits in-transaction; returns the new row.
-- Entity app.FinancialDocument (source: tblProjectFinancialDocuments). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_FinancialDocument_Create
    @FinancialId INT,
    @FinancialDocumentTypeId INT,
    @IsRequired BIT,
    @ReasonNotCreated NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @FinancialId IS NULL
        THROW 50004, N'VALIDATION:FinancialId is required', 1;
    IF @FinancialDocumentTypeId IS NULL
        THROW 50004, N'VALIDATION:FinancialDocumentTypeId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.FinancialDocument ([FinancialId], [FinancialDocumentTypeId], [IsRequired], [ReasonNotCreated], CreatedBy)
    VALUES (@FinancialId, @FinancialDocumentTypeId, @IsRequired, @ReasonNotCreated, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.FinancialDocument', CAST(@Id AS NVARCHAR(64)),
            (SELECT FinancialDocumentId, [FinancialId], [FinancialDocumentTypeId], [IsRequired], [ReasonNotCreated]
             FROM app.FinancialDocument WHERE FinancialDocumentId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT FinancialDocumentId,
           [FinancialId],
           [FinancialDocumentTypeId],
           [IsRequired],
           [ReasonNotCreated],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.FinancialDocument
    WHERE FinancialDocumentId = @Id;
END;
GO
