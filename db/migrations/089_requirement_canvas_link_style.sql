-- 089_requirement_canvas_link_style.sql
-- How one canvas draws one link: its line shape, pattern, ends, weight, colour, attachment, line
-- jumps, and the line it branches from. A NULL keeps the canvas default, so a link nobody styled
-- looks as it always has. A row outlives its link, so undoing a link delete brings its look back;
-- reads only join links that exist. Every value is checked here as well as in the proc.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.RequirementCanvasLinkStyle', N'U') IS NULL
BEGIN
    CREATE TABLE app.RequirementCanvasLinkStyle (
        RequirementCanvasId INT         NOT NULL
            CONSTRAINT FK_RequirementCanvasLinkStyle_Canvas REFERENCES app.RequirementCanvas (RequirementCanvasId),
        UpstreamKind        VARCHAR(12) NOT NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_UpstreamKind
                CHECK (UpstreamKind COLLATE Latin1_General_BIN IN ('Requirement', 'Wbs')),
        UpstreamId          INT         NOT NULL,
        DownstreamId        INT         NOT NULL,
        LineShape           VARCHAR(8)  NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_LineShape
                CHECK (LineShape COLLATE Latin1_General_BIN IN ('straight', 'angled', 'curved')),
        LinePattern         VARCHAR(6)  NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_LinePattern
                CHECK (LinePattern COLLATE Latin1_General_BIN IN ('solid', 'dashed', 'dotted')),
        StartEnd            VARCHAR(5)  NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_StartEnd
                CHECK (StartEnd COLLATE Latin1_General_BIN IN ('none', 'arrow', 'open', 'dot')),
        EndEnd              VARCHAR(5)  NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_EndEnd
                CHECK (EndEnd COLLATE Latin1_General_BIN IN ('none', 'arrow', 'open', 'dot')),
        LineWeight          TINYINT     NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_LineWeight CHECK (LineWeight BETWEEN 1 AND 6),
        LineColour          CHAR(7)     NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_LineColour
                CHECK (LineColour COLLATE Latin1_General_BIN
                       LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        Attach              VARCHAR(8)  NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_Attach
                CHECK (Attach COLLATE Latin1_General_BIN IN ('fixed', 'floating')),
        SourceSide          VARCHAR(6)  NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_SourceSide
                CHECK (SourceSide COLLATE Latin1_General_BIN IN ('top', 'right', 'bottom', 'left')),
        TargetSide          VARCHAR(6)  NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_TargetSide
                CHECK (TargetSide COLLATE Latin1_General_BIN IN ('top', 'right', 'bottom', 'left')),
        Jumps               BIT         NULL,
        BranchFromId        INT         NULL,
        BranchAt            TINYINT     NULL
            CONSTRAINT CK_RequirementCanvasLinkStyle_BranchAt CHECK (BranchAt BETWEEN 0 AND 100),
        UpdatedAtUtc        DATETIME2   NOT NULL
            CONSTRAINT DF_RequirementCanvasLinkStyle_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_RequirementCanvasLinkStyle
            PRIMARY KEY (RequirementCanvasId, UpstreamKind, UpstreamId, DownstreamId),
        CONSTRAINT CK_RequirementCanvasLinkStyle_Branch
            CHECK (BranchAt IS NULL OR BranchFromId IS NOT NULL),
        CONSTRAINT CK_RequirementCanvasLinkStyle_BranchSelf
            CHECK (BranchFromId IS NULL OR BranchFromId <> DownstreamId)
    );
END;
GO
