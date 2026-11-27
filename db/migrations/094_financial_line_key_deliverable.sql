-- 094_financial_line_key_deliverable.sql — a budget line can remember the WBS item it was imported from,
-- so importing the WBS budget again adds only the items not imported yet. At most one live line per
-- WBS item in a financial; deleting that line lets the next import add it again.
-- Additive and idempotent.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.FinancialLine', N'KeyDeliverableId') IS NULL
    ALTER TABLE app.FinancialLine ADD KeyDeliverableId INT NULL
        CONSTRAINT FK_FinancialLine_KeyDeliverable REFERENCES app.KeyDeliverable (KeyDeliverableId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_FinancialLine_KeyDeliverable'
                 AND object_id = OBJECT_ID(N'app.FinancialLine'))
    CREATE UNIQUE INDEX UX_FinancialLine_KeyDeliverable
        ON app.FinancialLine (FinancialId, KeyDeliverableId)
        WHERE KeyDeliverableId IS NOT NULL AND IsDeleted = 0;
GO
