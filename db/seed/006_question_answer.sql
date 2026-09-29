-- 006_question_answer.sql — seed app.QuestionAnswer from tblInterviewQuestionsAnswers (12 rows).
-- Source: docs/source-analysis/access-database.md §4 `tblInterviewQuestionsAnswers`.
-- Row 3 (QAID=3) is absent from the source table — omitted deliberately.
-- QAID 10 and 11 have NULL ProjectID in the source — included here with ProjectId = NULL.
--   Migration 012 makes ProjectId nullable and adds SourceQAId to allow this.
--   Migration 012 also backfills SourceQAId on rows inserted by the old seed (C11-1 fix).
-- Idempotent: MERGE on SourceQAId inserts missing rows only — no WHEN MATCHED update
--   so that user edits to seeded records are never overwritten on re-deployment (C11-2 fix).
USE ProjectManager;
GO

-- Ensure we have valid project seeds (ProjectId 2, 14, 22 are in 002_project.sql seed).

MERGE app.QuestionAnswer AS target
USING (VALUES
    -- SourceQAId, ProjectId, Question, Answer, Category, Priority, AssignedTo
    (1,  2,    N'How soon can you complete the Notes section?',
               N'by 20th it will be done and dusted',                              NULL, NULL, NULL),
    (2,  2,    N'I need a little work done, are you available?',
               N'Yes, apart from this there is nothing else important I am doing', NULL, NULL, NULL),
    (4,  2,    N'Hey',
               N'Yes',                                                             NULL, NULL, NULL),
    (5,  2,    N'Another Question',
               N'I am answering it',                                               NULL, NULL, NULL),
    (6,  2,    N'Yet another question',
               N'Answered not yet',                                                NULL, NULL, NULL),
    (7,  2,    N'Question',
               N'Answer',                                                          NULL, NULL, NULL),
    (8,  2,    N'Another question',
               N'Another answer',                                                  NULL, NULL, NULL),
    (9,  14,   N'Question',
               N'Answer',                                                          NULL, NULL, NULL),
    (10, NULL, N'Question',
               N'Answer',                                                          NULL, NULL, NULL),
    (11, NULL, N'Question',
               N'Answer',                                                          NULL, NULL, NULL),
    (12, 22,   N'Question',
               N'Yes',                                                             NULL, NULL, NULL),
    (13, 2,    N'Question',
               N'Answer',                                                          NULL, NULL, NULL)
) AS source (SourceQAId, ProjectId, Question, Answer, Category, Priority, AssignedTo)
ON target.SourceQAId = source.SourceQAId   -- stable idempotency key (migration 012)
WHEN NOT MATCHED THEN
    INSERT (SourceQAId, ProjectId, Question, Answer, Category, Priority, AssignedTo, CreatedBy)
    VALUES (source.SourceQAId, source.ProjectId, source.Question, source.Answer,
            source.Category, source.Priority, source.AssignedTo, 1);
GO
