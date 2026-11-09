-- 068_project_po_requisition_status.sql — Financing gains two dropdowns: where a purchase order or
-- requisition stands, and where a requisition stands. Both are managed lists an Admin can edit, and
-- a project stores the option label, as it does for RiskLevel. They replace the Purchase order and
-- Requisition switches: the app no longer reads or writes those BIT columns, which stay in the
-- table so the values already saved are kept.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Project', N'PoRequisitionStatus') IS NULL
    ALTER TABLE app.Project ADD [PoRequisitionStatus] NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'app.Project', N'RequisitionStatus') IS NULL
    ALTER TABLE app.Project ADD [RequisitionStatus] NVARCHAR(50) NULL;
GO

MERGE app.LookupList AS t
USING (VALUES (N'project.po-requisition-status'), (N'project.requisition-status')) AS s (ListKey)
ON t.ListKey = s.ListKey
WHEN NOT MATCHED THEN INSERT (ListKey) VALUES (s.ListKey);
GO

DECLARE @Seed TABLE (ListKey NVARCHAR(64), Label NVARCHAR(50), SortOrder INT, IsLocked BIT);
INSERT INTO @Seed (ListKey, Label, SortOrder, IsLocked) VALUES
    (N'project.po-requisition-status', N'Draft',             1, 0),
    (N'project.po-requisition-status', N'Submitted',         2, 0),
    (N'project.po-requisition-status', N'Approved',          3, 0),
    (N'project.po-requisition-status', N'Invoiced',          4, 0),
    (N'project.requisition-status',    N'Draft',             1, 0),
    (N'project.requisition-status',    N'Submitted',         2, 0),
    (N'project.requisition-status',    N'Approved',          3, 0),
    (N'project.requisition-status',    N'Sent for Approval', 4, 0);

-- Matching on the label never resurrects an option an Admin removed.
MERGE app.LookupOption AS t
USING @Seed AS s
ON t.ListKey = s.ListKey AND t.Label = s.Label
WHEN NOT MATCHED THEN INSERT (ListKey, Label, SortOrder, IsLocked, CreatedBy)
                      VALUES (s.ListKey, s.Label, s.SortOrder, s.IsLocked, 0);
GO
