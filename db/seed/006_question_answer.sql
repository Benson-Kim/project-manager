-- 006_question_answer.sql — seed app.QuestionAnswer from tblInterviewQuestionsAnswers (12 rows).
-- Source: docs/source-analysis/access-database.md §4 `tblInterviewQuestionsAnswers`.
-- Row 3 (QAID=3) is absent from the source table — omitted deliberately.
-- Rows with NULL ProjectID are omitted (no valid FK target in seed data).
-- Idempotent: MERGE on QAID via a helper CTE to avoid re-inserting on re-run.
USE ProjectManager;
GO

-- Ensure we have a valid project seed (ProjectId=2 is the reference project in seed data).
-- Seeds are applied after 002_project.sql which inserts 18 projects including ProjectId=2 and ProjectId=14.

MERGE app.QuestionAnswer AS target
USING (VALUES
    -- QAID, ProjectId, Question, Answer
    (1,  2,  N'How soon can you complete the Notes section?',
             N'by 20th it will be done and dusted',    NULL, NULL, NULL),
    (2,  2,  N'I need a little work done, are you available?',
             N'Yes, apart from this there is nothing else important I am doing', NULL, NULL, NULL),
    (4,  2,  N'Hey',
             N'Yes',                                    NULL, NULL, NULL),
    (5,  2,  N'Another Question',
             N'I am answering it',                     NULL, NULL, NULL),
    (6,  2,  N'Yet another question',
             N'Answered not yet',                      NULL, NULL, NULL),
    (7,  2,  N'Question',
             N'Answer',                                NULL, NULL, NULL),
    (8,  2,  N'Another question',
             N'Another answer',                        NULL, NULL, NULL),
    (9,  14, N'Question',
             N'Answer',                                NULL, NULL, NULL),
    (12, 22, N'Question',
             N'Yes',                                   NULL, NULL, NULL),
    (13, 2,  N'Question',
             N'Answer',                                NULL, NULL, NULL)
) AS source (SourceId, ProjectId, Question, Answer, Category, Priority, AssignedTo)
ON target.ProjectId = source.ProjectId
   AND target.Question = source.Question
   AND target.IsDeleted = 0
WHEN NOT MATCHED THEN
    INSERT (ProjectId, Question, Answer, Category, Priority, AssignedTo, CreatedBy)
    VALUES (source.ProjectId, source.Question, source.Answer,
            source.Category, source.Priority, source.AssignedTo, 1);
GO
