-- 033_financial_documents.sql - the MSSS document checklist of a financial (ADR-0030, on top of
-- ADR-0029; PPTX slide 2 "Financial Documents Required?").
--   app.FinancialDocument becomes the financial's own list: a Name and a SortOrder per row, the
--     legacy type id optional (kept for the rows that came from Access), IsRequired tri-state
--     (NULL = not decided yet), and Suggestions: advisory rules [{kind, amount?, reason}] that
--     propose a reason for not creating the document from the budget. Nothing is enforced.
--   app.FinancialDocumentFile: a document's attachments (owner-scoped, ADR-0026 §1).
--   The default template (else the one named "Standard (MSSS)", in case an Admin renamed or
--     re-marked it) gains the nine MSSS documents when it lists none yet (display spellings
--     corrected; app.FinancialDocumentType keeps the Access originals).
--   The legacy procs that had no access check are dropped (deleting their files leaves them in
--     existing databases).
-- Saved as UTF-8 with a BOM (French labels); sqlcmd reads it as UTF-8. Idempotent.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.FinancialDocument', N'Name') IS NULL
    ALTER TABLE app.FinancialDocument ADD [Name] NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'app.FinancialDocument', N'SortOrder') IS NULL
    ALTER TABLE app.FinancialDocument ADD SortOrder INT NOT NULL
        CONSTRAINT DF_FinancialDocument_SortOrder DEFAULT 0;
GO
IF COL_LENGTH(N'app.FinancialDocument', N'Suggestions') IS NULL
    ALTER TABLE app.FinancialDocument ADD Suggestions NVARCHAR(MAX) NOT NULL
        CONSTRAINT DF_FinancialDocument_Suggestions DEFAULT N'[]'
        CONSTRAINT CK_FinancialDocument_Suggestions CHECK (ISJSON(Suggestions) = 1);
GO

UPDATE d SET
    [Name] = CASE d.FinancialDocumentTypeId
                 WHEN 1 THEN N'DA (Dossier d''affaires)'
                 WHEN 2 THEN N'DAS (Dossier d''affaires simplifié)'
                 WHEN 3 THEN N'Demande de signature'
                 WHEN 4 THEN N'DO (Dossier d''opportunité)'
                 WHEN 5 THEN N'Appel d''offres / Call for tender'
                 WHEN 6 THEN N'Montage financier'
                 WHEN 7 THEN N'Réquisition'
                 WHEN 8 THEN N'A1'
                 WHEN 9 THEN N'Signed direct contract'
                 ELSE LEFT(t.DocumentType, 200)
             END,
    SortOrder = t.SortOrder
FROM app.FinancialDocument AS d
JOIN app.FinancialDocumentType AS t ON t.FinancialDocumentTypeId = d.FinancialDocumentTypeId
WHERE d.[Name] IS NULL;
GO
UPDATE app.FinancialDocument SET [Name] = N'Document ' + CAST(FinancialDocumentId AS NVARCHAR(12))
WHERE [Name] IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'app.FinancialDocument') AND name = N'Name' AND is_nullable = 1)
    ALTER TABLE app.FinancialDocument ALTER COLUMN [Name] NVARCHAR(200) NOT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_FinancialDocument_FinancialType' AND object_id = OBJECT_ID(N'app.FinancialDocument'))
    DROP INDEX UQ_FinancialDocument_FinancialType ON app.FinancialDocument;
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancialDocument_FinancialDocumentTypeId' AND object_id = OBJECT_ID(N'app.FinancialDocument'))
    DROP INDEX IX_FinancialDocument_FinancialDocumentTypeId ON app.FinancialDocument;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'app.FinancialDocument') AND name = N'FinancialDocumentTypeId' AND is_nullable = 0)
    ALTER TABLE app.FinancialDocument ALTER COLUMN FinancialDocumentTypeId INT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_FinancialDocument_IsRequired')
    ALTER TABLE app.FinancialDocument DROP CONSTRAINT DF_FinancialDocument_IsRequired;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'app.FinancialDocument') AND name = N'IsRequired' AND is_nullable = 0)
    ALTER TABLE app.FinancialDocument ALTER COLUMN IsRequired BIT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_FinancialDocument_Name' AND object_id = OBJECT_ID(N'app.FinancialDocument'))
    CREATE UNIQUE INDEX UQ_FinancialDocument_Name ON app.FinancialDocument (FinancialId, [Name]) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.FinancialDocumentFile', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialDocumentFile (
        FinancialDocumentId INT NOT NULL
            CONSTRAINT FK_FinancialDocumentFile_FinancialDocument REFERENCES app.FinancialDocument (FinancialDocumentId),
        FileAttachmentId    INT NOT NULL
            CONSTRAINT FK_FinancialDocumentFile_FileAttachment REFERENCES app.FileAttachment (FileAttachmentId),
        CONSTRAINT PK_FinancialDocumentFile PRIMARY KEY (FinancialDocumentId, FileAttachmentId),
        CONSTRAINT UQ_FinancialDocumentFile_FileAttachment UNIQUE (FileAttachmentId)
    );
END;
GO

DECLARE @Documents NVARCHAR(MAX) = N'[
  {
    "name": "DA (Dossier d''affaires)",
    "required": null,
    "reason": null,
    "suggestions": [
      { "kind": "noCapital", "reason": "No DA or DAS is created: the cost is considered non-capitalizable." },
      { "kind": "budgetBelow", "amount": "200000.00", "reason": "The project is under 200,000 $: no documentation is needed per the MSSS." }
    ]
  },
  {
    "name": "DAS (Dossier d''affaires simplifié)",
    "required": null,
    "reason": null,
    "suggestions": [
      { "kind": "noCapital", "reason": "No DA or DAS is created: the cost is considered non-capitalizable." },
      { "kind": "budgetBelow", "amount": "200000.00", "reason": "The project is under 200,000 $: no documentation is needed per the MSSS." }
    ]
  },
  {
    "name": "DO (Dossier d''opportunité)",
    "required": null,
    "reason": null,
    "suggestions": [
      { "kind": "budgetBelow", "amount": "200000.00", "reason": "The project is under 200,000 $: no documentation is needed per the MSSS." }
    ]
  },
  { "name": "Appel d''offres / Call for tender", "required": null, "reason": null, "suggestions": [] },
  { "name": "Montage financier", "required": null, "reason": null, "suggestions": [] },
  { "name": "Demande de signature", "required": null, "reason": null, "suggestions": [] },
  { "name": "Réquisition", "required": null, "reason": null, "suggestions": [] },
  { "name": "A1", "required": null, "reason": null, "suggestions": [] },
  { "name": "Signed direct contract", "required": null, "reason": null, "suggestions": [] }
]';
DECLARE @TemplateId INT =
    ISNULL((SELECT TOP (1) FinancialTemplateId FROM app.FinancialTemplate WHERE IsDefault = 1 AND IsDeleted = 0),
           (SELECT TOP (1) FinancialTemplateId FROM app.FinancialTemplate
            WHERE [Name] = N'Standard (MSSS)' AND IsDeleted = 0));
UPDATE app.FinancialTemplate
SET [Definition] = JSON_MODIFY([Definition], N'$.documents', JSON_QUERY(@Documents))
WHERE FinancialTemplateId = @TemplateId AND JSON_QUERY([Definition], N'$.documents') IS NULL;
GO

IF OBJECT_ID(N'dbo.usp_FinancialDocument_GetById', N'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_FinancialDocument_GetById;
GO
IF OBJECT_ID(N'dbo.usp_FinancialDocument_List', N'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_FinancialDocument_List;
GO
IF OBJECT_ID(N'dbo.usp_Financial_GetDocumentChecklist', N'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_Financial_GetDocumentChecklist;
GO
