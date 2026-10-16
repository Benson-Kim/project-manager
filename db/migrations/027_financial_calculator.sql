-- 027_financial_calculator.sql - the financials calculator (ADR-0029; source
-- docs/source/Financials Calculated.xlsx and PPTX slide 2).
--   app.FinancialTemplate: a master template, kept as one JSON document (Definition) that only
--     Admins write: horizon, fiscal-year start month, escalation and flag rates, tax profiles,
--     cost categories, funding sources and standard lines. IsDefault marks the one offered first.
--   app.Financial gains the calculator settings. A financial created from a template is a copy
--     (snapshot): later template edits never reach it. Existing rows take the defaults.
--   app.FinancialTaxProfile: a financial's own named tax rates (a net rate, typed), and
--     app.FinancialTaxProfileRate: optional steps "from fiscal year X the rate is r"; a year before
--     the first step takes the profile's own rate.
--   app.Financial.BudgetIncludesTax: whether the authorised Budget is tax included (default) or
--     before tax, so the planner compares it with the matching total.
--   app.FinancialLine + app.FinancialLineAmount: budget lines in three sections with typed
--     pre-tax amounts keyed by fiscal year (the year it starts in), never by column.
--   app.FinancialTransaction: invoices against a line, pre-tax, with the tax rate captured when
--     entered, so a later rate change never restates what was spent.
--   One default template from the workbook, only when no template exists yet.
-- Saved as UTF-8 with a BOM (French labels); sqlcmd reads it as UTF-8. Idempotent.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.FinancialTemplate', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialTemplate (
        FinancialTemplateId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FinancialTemplate PRIMARY KEY,
        [Name]        NVARCHAR(100) NOT NULL,
        [Definition]  NVARCHAR(MAX) NOT NULL CONSTRAINT CK_FinancialTemplate_Definition CHECK (ISJSON([Definition]) = 1),
        IsDefault     BIT NOT NULL CONSTRAINT DF_FinancialTemplate_IsDefault DEFAULT 0,
        IsDeleted     BIT NOT NULL CONSTRAINT DF_FinancialTemplate_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_FinancialTemplate_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_FinancialTemplate_Name' AND object_id = OBJECT_ID(N'app.FinancialTemplate'))
    CREATE UNIQUE INDEX UQ_FinancialTemplate_Name ON app.FinancialTemplate ([Name]) WHERE IsDeleted = 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_FinancialTemplate_Default' AND object_id = OBJECT_ID(N'app.FinancialTemplate'))
    CREATE UNIQUE INDEX UQ_FinancialTemplate_Default ON app.FinancialTemplate (IsDefault) WHERE IsDefault = 1 AND IsDeleted = 0;
GO

IF COL_LENGTH(N'app.Financial', N'Title') IS NULL
    ALTER TABLE app.Financial ADD Title NVARCHAR(150) NULL;
GO
IF COL_LENGTH(N'app.Financial', N'TemplateName') IS NULL
    ALTER TABLE app.Financial ADD TemplateName NVARCHAR(100) NULL;
GO
IF COL_LENGTH(N'app.Financial', N'FirstFiscalYear') IS NULL
    ALTER TABLE app.Financial ADD FirstFiscalYear SMALLINT NOT NULL
        CONSTRAINT DF_Financial_FirstFiscalYear
            DEFAULT (CASE WHEN MONTH(SYSUTCDATETIME()) >= 4 THEN YEAR(SYSUTCDATETIME()) ELSE YEAR(SYSUTCDATETIME()) - 1 END)
        CONSTRAINT CK_Financial_FirstFiscalYear CHECK (FirstFiscalYear BETWEEN 2000 AND 2100);
GO
IF COL_LENGTH(N'app.Financial', N'HorizonYears') IS NULL
    ALTER TABLE app.Financial ADD HorizonYears TINYINT NOT NULL
        CONSTRAINT DF_Financial_HorizonYears DEFAULT 5
        CONSTRAINT CK_Financial_HorizonYears CHECK (HorizonYears BETWEEN 1 AND 7);
GO
IF COL_LENGTH(N'app.Financial', N'FiscalYearStartMonth') IS NULL
    ALTER TABLE app.Financial ADD FiscalYearStartMonth TINYINT NOT NULL
        CONSTRAINT DF_Financial_FiscalYearStartMonth DEFAULT 4
        CONSTRAINT CK_Financial_FiscalYearStartMonth CHECK (FiscalYearStartMonth BETWEEN 1 AND 12);
GO
IF COL_LENGTH(N'app.Financial', N'EscalationRate') IS NULL
    ALTER TABLE app.Financial ADD EscalationRate DECIMAL(9,6) NOT NULL
        CONSTRAINT DF_Financial_EscalationRate DEFAULT 0
        CONSTRAINT CK_Financial_EscalationRate CHECK (EscalationRate BETWEEN 0 AND 1);
GO
IF COL_LENGTH(N'app.Financial', N'FlagThresholdRate') IS NULL
    ALTER TABLE app.Financial ADD FlagThresholdRate DECIMAL(9,6) NOT NULL
        CONSTRAINT DF_Financial_FlagThresholdRate DEFAULT 0.1
        CONSTRAINT CK_Financial_FlagThresholdRate CHECK (FlagThresholdRate BETWEEN 0 AND 1);
GO
IF COL_LENGTH(N'app.Financial', N'CostCategories') IS NULL
    ALTER TABLE app.Financial ADD CostCategories NVARCHAR(MAX) NOT NULL
        CONSTRAINT DF_Financial_CostCategories DEFAULT N'[]'
        CONSTRAINT CK_Financial_CostCategories CHECK (ISJSON(CostCategories) = 1);
GO
IF COL_LENGTH(N'app.Financial', N'FundingSources') IS NULL
    ALTER TABLE app.Financial ADD FundingSources NVARCHAR(MAX) NOT NULL
        CONSTRAINT DF_Financial_FundingSources DEFAULT N'[]'
        CONSTRAINT CK_Financial_FundingSources CHECK (ISJSON(FundingSources) = 1);
GO

IF OBJECT_ID(N'app.FinancialTaxProfile', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialTaxProfile (
        FinancialTaxProfileId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FinancialTaxProfile PRIMARY KEY,
        FinancialId   INT NOT NULL CONSTRAINT FK_FinancialTaxProfile_Financial REFERENCES app.Financial (FinancialId),
        [Name]        NVARCHAR(100) NOT NULL,
        Rate          DECIMAL(9,6) NOT NULL CONSTRAINT CK_FinancialTaxProfile_Rate CHECK (Rate BETWEEN 0 AND 1),
        SortOrder     INT NOT NULL CONSTRAINT DF_FinancialTaxProfile_SortOrder DEFAULT 0,
        IsDeleted     BIT NOT NULL CONSTRAINT DF_FinancialTaxProfile_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_FinancialTaxProfile_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_FinancialTaxProfile_Name' AND object_id = OBJECT_ID(N'app.FinancialTaxProfile'))
    CREATE UNIQUE INDEX UQ_FinancialTaxProfile_Name ON app.FinancialTaxProfile (FinancialId, [Name]) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'app.FinancialTaxProfileRate', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialTaxProfileRate (
        FinancialTaxProfileId INT NOT NULL CONSTRAINT FK_FinancialTaxProfileRate_Profile REFERENCES app.FinancialTaxProfile (FinancialTaxProfileId),
        FromFiscalYear SMALLINT NOT NULL CONSTRAINT CK_FinancialTaxProfileRate_Year CHECK (FromFiscalYear BETWEEN 2000 AND 2106),
        Rate           DECIMAL(9,6) NOT NULL CONSTRAINT CK_FinancialTaxProfileRate_Rate CHECK (Rate BETWEEN 0 AND 1),
        CONSTRAINT PK_FinancialTaxProfileRate PRIMARY KEY (FinancialTaxProfileId, FromFiscalYear)
    );
END;
GO

IF COL_LENGTH(N'app.Financial', N'BudgetIncludesTax') IS NULL
    ALTER TABLE app.Financial ADD BudgetIncludesTax BIT NOT NULL
        CONSTRAINT DF_Financial_BudgetIncludesTax DEFAULT 1;
GO

IF OBJECT_ID(N'app.FinancialLine', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialLine (
        FinancialLineId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FinancialLine PRIMARY KEY,
        FinancialId   INT NOT NULL CONSTRAINT FK_FinancialLine_Financial REFERENCES app.Financial (FinancialId),
        [Section]     VARCHAR(10) NOT NULL CONSTRAINT CK_FinancialLine_Section CHECK ([Section] IN ('operating', 'capital', 'other')),
        [Description] NVARCHAR(255) NOT NULL,
        CostCategory  NVARCHAR(150) NULL,
        FundingSource NVARCHAR(150) NULL,
        Supplier      NVARCHAR(255) NULL,
        GlAccount     NVARCHAR(100) NULL,
        FinancialTaxProfileId INT NULL CONSTRAINT FK_FinancialLine_TaxProfile REFERENCES app.FinancialTaxProfile (FinancialTaxProfileId),
        IsRecurrent   BIT NOT NULL CONSTRAINT DF_FinancialLine_IsRecurrent DEFAULT 0,
        Comments      NVARCHAR(1000) NULL,
        SortOrder     INT NOT NULL CONSTRAINT DF_FinancialLine_SortOrder DEFAULT 0,
        IsDeleted     BIT NOT NULL CONSTRAINT DF_FinancialLine_IsDeleted DEFAULT 0,
        DeletedAtUtc  DATETIME2 NULL,
        DeletedBy     INT NULL,
        CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_FinancialLine_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy     INT NOT NULL,
        UpdatedAtUtc  DATETIME2 NULL,
        UpdatedBy     INT NULL,
        RowVer        ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancialLine_Financial' AND object_id = OBJECT_ID(N'app.FinancialLine'))
    CREATE INDEX IX_FinancialLine_Financial ON app.FinancialLine (FinancialId, IsDeleted, [Section], SortOrder);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancialLine_TaxProfile' AND object_id = OBJECT_ID(N'app.FinancialLine'))
    CREATE INDEX IX_FinancialLine_TaxProfile ON app.FinancialLine (FinancialTaxProfileId, IsDeleted);
GO

IF OBJECT_ID(N'app.FinancialLineAmount', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialLineAmount (
        FinancialLineId INT NOT NULL CONSTRAINT FK_FinancialLineAmount_Line REFERENCES app.FinancialLine (FinancialLineId),
        FiscalYear    SMALLINT NOT NULL CONSTRAINT CK_FinancialLineAmount_FiscalYear CHECK (FiscalYear BETWEEN 2000 AND 2106),
        Amount        DECIMAL(19,2) NOT NULL CONSTRAINT CK_FinancialLineAmount_Amount CHECK (Amount BETWEEN 0 AND 999999999.99),
        CONSTRAINT PK_FinancialLineAmount PRIMARY KEY (FinancialLineId, FiscalYear)
    );
END;
GO

IF OBJECT_ID(N'app.FinancialTransaction', N'U') IS NULL
BEGIN
    CREATE TABLE app.FinancialTransaction (
        FinancialTransactionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FinancialTransaction PRIMARY KEY,
        FinancialLineId INT NOT NULL CONSTRAINT FK_FinancialTransaction_Line REFERENCES app.FinancialLine (FinancialLineId),
        FiscalYear      SMALLINT NOT NULL CONSTRAINT CK_FinancialTransaction_FiscalYear CHECK (FiscalYear BETWEEN 2000 AND 2106),
        TransactionDate DATE NOT NULL,
        Reference       NVARCHAR(100) NULL,
        [Description]   NVARCHAR(255) NULL,
        Amount          DECIMAL(19,2) NOT NULL
            CONSTRAINT CK_FinancialTransaction_Amount CHECK (Amount <> 0 AND Amount BETWEEN -999999999.99 AND 999999999.99),
        TaxRate         DECIMAL(9,6) NOT NULL CONSTRAINT CK_FinancialTransaction_TaxRate CHECK (TaxRate BETWEEN 0 AND 1),
        IsDeleted       BIT NOT NULL CONSTRAINT DF_FinancialTransaction_IsDeleted DEFAULT 0,
        DeletedAtUtc    DATETIME2 NULL,
        DeletedBy       INT NULL,
        CreatedAtUtc    DATETIME2 NOT NULL CONSTRAINT DF_FinancialTransaction_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy       INT NOT NULL,
        UpdatedAtUtc    DATETIME2 NULL,
        UpdatedBy       INT NULL,
        RowVer          ROWVERSION
    );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FinancialTransaction_Line' AND object_id = OBJECT_ID(N'app.FinancialTransaction'))
    CREATE INDEX IX_FinancialTransaction_Line ON app.FinancialTransaction (FinancialLineId, IsDeleted)
        INCLUDE (FiscalYear, TransactionDate, Amount, TaxRate);
GO

IF NOT EXISTS (SELECT 1 FROM app.FinancialTemplate)
    INSERT INTO app.FinancialTemplate ([Name], [Definition], IsDefault, CreatedBy)
    VALUES (N'Standard (MSSS)', N'{
  "horizonYears": 5,
  "fiscalYearStartMonth": 4,
  "escalationRate": "0.050000",
  "flagThresholdRate": "0.100000",
  "taxProfiles": [
    {
      "key": "t1",
      "name": "Net tax (public body)",
      "rate": "0.056879",
      "isDefault": true
    },
    {
      "key": "t2",
      "name": "GST + QST (full)",
      "rate": "0.149750",
      "isDefault": false
    }
  ],
  "costCategories": [
    "Acquisition",
    "Autres frais",
    "Impartition auprès d''un autre OP",
    "Location",
    "Rémunération du personnel de l''OP",
    "Rémunération du personnel d''un autre OP en PS",
    "Réserve",
    "Ressources externes"
  ],
  "fundingSources": [
    "Budget de fonctionnement - Courant (CAP)",
    "Budget de fonctionnement - Solde de fonds (CAP)",
    "Budget de fonctionnement - Crédits reportés (CAP)",
    "Budget de fonctionnement - Solde de fonds (NON CAP)",
    "Budget de fonctionnement - Crédits reportés (NON CAP)",
    "Budget d''immobilisation  - Courant (CAP)",
    "Budget d''immobilisation  - Solde de fonds (CAP)",
    "Budget d''immobilisation  - Crédits reportés (CAP)",
    "Autres dépenses TI de nature captalisable (ADTI)",
    "Maintien d''actifs informationnels (MAI)",
    "Accélération numérique (AC)",
    "Fondation - fonds d''exploitation (CAP)",
    "Fondation - fonds d''exploitation ( NON CAP)",
    "Fondation - fonds d''immobilisation (CAP)",
    "Autres - Transfert MSSS -Cap",
    "Autres - Transfert MSSS - Non Cap",
    "CO/CDO - Transfert MSSS - Cap",
    "CO/CDO - Transfert MSSS - Non Cap",
    "Autres financés par le gouvernement fédéral (NON CAP)",
    "Conversion - Dépenses réelles - 2018-2019",
    "Fonds immo - PCFI - Cap",
    "Fonds immo - PCEM - Cap",
    "Fonds immo - AC - Cap",
    "Fonds immo - MAI - Cap",
    "Fonds immo - Courant - Cap",
    "Fonds exploitation - Crédits reportés - Non Cap",
    "Fonds exploitation - Solde de fonds - Non Cap",
    "Fonds exploitation - Dépense de l''exercice - Non Cap",
    "Fonds exploitation - Crédits reportés - Cap",
    "Fonds exploitation - Solde de fonds - Cap",
    "Fonds exploitation - Dépense de l''exercice - Cap",
    "PMT – Transfert MSSS (NON CAP)",
    "PMT – EIRI (CAP))"
  ],
  "lines": [
    {
      "section": "operating",
      "description": "Project management",
      "costCategory": "Rémunération du personnel d''un autre OP en PS",
      "fundingSource": "Autres - Transfert MSSS - Non Cap",
      "taxProfileKey": "t1",
      "isRecurrent": false,
      "amount": null
    },
    {
      "section": "operating",
      "description": "System management",
      "costCategory": null,
      "fundingSource": null,
      "taxProfileKey": "t1",
      "isRecurrent": false,
      "amount": null
    },
    {
      "section": "operating",
      "description": "Programmer",
      "costCategory": null,
      "fundingSource": null,
      "taxProfileKey": null,
      "isRecurrent": false,
      "amount": null
    },
    {
      "section": "capital",
      "description": "Networking installation",
      "costCategory": null,
      "fundingSource": null,
      "taxProfileKey": "t1",
      "isRecurrent": false,
      "amount": null
    },
    {
      "section": "capital",
      "description": "Remote Assist training (super users)",
      "costCategory": null,
      "fundingSource": null,
      "taxProfileKey": "t1",
      "isRecurrent": false,
      "amount": null
    }
  ]
}', 1, 0);
GO
