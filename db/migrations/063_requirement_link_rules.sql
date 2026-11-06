-- 063_requirement_link_rules.sql — configurable requirement links (ADR-0060).
-- app.RequirementLinkRule: which type may sit downstream of which, one row per allowed ordered pair.
--   It is app-wide, and UpstreamType also takes 'WBS' for a link to a WBS item. The seed is the
--   client's chain WBS, BR, SR, FR/NFR, TR, TC: every pair whose downstream type is at or below its
--   upstream type, so levels can be skipped and same-type links work. Backwards pairs start unticked.
-- Both link tables gain the link's own record: rationale, status and who last changed it. Author
--   and date are the CreatedBy and CreatedAtUtc they already have. Only Active counts as coverage.
-- Additive: every existing link becomes Active, and an older build ignores the new columns.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.RequirementLinkRule', N'U') IS NULL
BEGIN
    CREATE TABLE app.RequirementLinkRule (
        DownstreamType VARCHAR(3) NOT NULL
            CONSTRAINT CK_RequirementLinkRule_Downstream
                CHECK (DownstreamType IN ('BR', 'SR', 'FR', 'NFR', 'TR', 'TC')),
        UpstreamType   VARCHAR(3) NOT NULL
            CONSTRAINT CK_RequirementLinkRule_Upstream
                CHECK (UpstreamType IN ('WBS', 'BR', 'SR', 'FR', 'NFR', 'TR', 'TC')),
        CreatedAtUtc   DATETIME2 NOT NULL
            CONSTRAINT DF_RequirementLinkRule_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy      INT NULL,
        CONSTRAINT PK_RequirementLinkRule PRIMARY KEY (DownstreamType, UpstreamType)
    );

    INSERT INTO app.RequirementLinkRule (DownstreamType, UpstreamType)
    SELECT d.Code, u.Code
    FROM (VALUES ('BR', 1), ('SR', 2), ('FR', 3), ('NFR', 3), ('TR', 4), ('TC', 5)) AS d (Code, Rung)
    CROSS JOIN (VALUES ('WBS', 0), ('BR', 1), ('SR', 2), ('FR', 3), ('NFR', 3), ('TR', 4), ('TC', 5))
        AS u (Code, Rung)
    WHERE d.Rung >= u.Rung;
END;
GO

IF COL_LENGTH(N'app.RequirementTrace', N'LinkStatus') IS NULL
    ALTER TABLE app.RequirementTrace ADD
        Rationale    NVARCHAR(1000) NULL,
        LinkStatus   VARCHAR(10) NOT NULL
            CONSTRAINT DF_RequirementTrace_LinkStatus DEFAULT 'Active'
            CONSTRAINT CK_RequirementTrace_LinkStatus
                CHECK (LinkStatus IN ('Proposed', 'Active', 'Retired')),
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL,
        RowVer       ROWVERSION;
GO

IF COL_LENGTH(N'app.RequirementDeliverable', N'LinkStatus') IS NULL
    ALTER TABLE app.RequirementDeliverable ADD
        Rationale    NVARCHAR(1000) NULL,
        LinkStatus   VARCHAR(10) NOT NULL
            CONSTRAINT DF_RequirementDeliverable_LinkStatus DEFAULT 'Active'
            CONSTRAINT CK_RequirementDeliverable_LinkStatus
                CHECK (LinkStatus IN ('Proposed', 'Active', 'Retired')),
        UpdatedAtUtc DATETIME2 NULL,
        UpdatedBy    INT NULL;
GO
