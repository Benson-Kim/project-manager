-- 095_project_math_state.sql — Project Math keeps what the team typed into its cards, one saved state per
-- project (shared by the project's team like every other project page). The app validates each card's
-- slice and falls back to the example numbers for a bad or missing one, so the JSON stays free-form here.
-- Additive and idempotent.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.ProjectMathState', N'U') IS NULL
    CREATE TABLE app.ProjectMathState
    (
        ProjectId       INT           NOT NULL
            CONSTRAINT PK_ProjectMathState PRIMARY KEY
            CONSTRAINT FK_ProjectMathState_Project REFERENCES app.Project (ProjectId),
        StateJson       NVARCHAR(MAX) NOT NULL
            CONSTRAINT CK_ProjectMathState_StateJson
            CHECK (ISJSON(StateJson) = 1 AND LEFT(StateJson, 1) = N'{' AND LEN(StateJson) <= 65536),
        UpdatedByUserId INT           NOT NULL,
        UpdatedAtUtc    DATETIME2     NOT NULL CONSTRAINT DF_ProjectMathState_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
        RowVer          ROWVERSION    NOT NULL
    );
GO
