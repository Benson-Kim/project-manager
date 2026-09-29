-- 009_question_answer.sql — create app.QuestionAnswer table.
-- Source: tblInterviewQuestionsAnswers (docs/source-analysis/access-database.md).
-- Soft delete + ROWVERSION concurrency + audit columns (STANDARDS §2.2).
-- AssignedTo is free text (not FK) — matches Access source design.
-- Category and Priority are constrained to vocabulary values at both the DB layer
-- (CHECK constraints) and the action layer (z.enum), so invalid strings can never
-- be persisted by any path (direct SQL, forged payload, or future proc).
-- NOTE: Migration 012 adds SourceQAId (seed idempotency key) and makes ProjectId
-- nullable so QAID 10 and 11 (null ProjectID in source) can be seeded faithfully.
-- Idempotent: wrapped in IF NOT EXISTS guard.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.QuestionAnswer', N'U') IS NULL
BEGIN
    CREATE TABLE app.QuestionAnswer (
        QuestionAnswerId  INT IDENTITY(1,1)  NOT NULL CONSTRAINT PK_QuestionAnswer PRIMARY KEY,
        ProjectId         INT                NOT NULL CONSTRAINT FK_QuestionAnswer_Project
                                                         REFERENCES app.Project(ProjectId),
        Question          NVARCHAR(MAX)      NOT NULL,
        Answer            NVARCHAR(MAX)      NULL,
        Category          NVARCHAR(255)      NULL
                              CONSTRAINT CK_QuestionAnswer_Category
                              CHECK (Category IS NULL OR Category IN (N'General', N'Technical', N'Budget', N'Other')),
        Priority          NVARCHAR(255)      NULL
                              CONSTRAINT CK_QuestionAnswer_Priority
                              CHECK (Priority IS NULL OR Priority IN (N'Critical', N'High', N'Medium', N'Low')),
        AssignedTo        NVARCHAR(255)      NULL,
        IsDeleted         BIT                NOT NULL CONSTRAINT DF_QuestionAnswer_IsDeleted DEFAULT 0,
        DeletedAtUtc      DATETIME2          NULL,
        DeletedBy         INT                NULL,
        CreatedAtUtc      DATETIME2          NOT NULL CONSTRAINT DF_QuestionAnswer_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
        CreatedBy         INT                NOT NULL,
        UpdatedAtUtc      DATETIME2          NULL,
        UpdatedBy         INT                NULL,
        RowVer            ROWVERSION
    );

    -- Covering index: list proc filters on ProjectId+IsDeleted and sorts/includes
    -- Question, Category, Priority, AssignedTo. One index serves all list proc paths.
    CREATE INDEX IX_QuestionAnswer_ProjectId
        ON app.QuestionAnswer (ProjectId, IsDeleted)
        INCLUDE (Question, Category, Priority, AssignedTo);
END;
GO
