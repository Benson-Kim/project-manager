-- 009_question_answer.sql — create app.QuestionAnswer table.
-- Source: tblInterviewQuestionsAnswers (docs/source-analysis/access-database.md).
-- Soft delete + ROWVERSION concurrency + audit columns (STANDARDS §2.2).
-- AssignedTo is free text (not FK) — matches Access source design.
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
        Category          NVARCHAR(255)      NULL,
        Priority          NVARCHAR(255)      NULL,
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

    -- Covering index for the list proc (sort: Question; filter: ProjectId + IsDeleted).
    CREATE INDEX IX_QuestionAnswer_ProjectId
        ON app.QuestionAnswer (ProjectId, IsDeleted)
        INCLUDE (Question, Category, Priority, AssignedTo);

    -- Full-text search on Category and Priority for filter queries.
    CREATE INDEX IX_QuestionAnswer_Category
        ON app.QuestionAnswer (Category, IsDeleted)
        WHERE IsDeleted = 0;
END;
GO
