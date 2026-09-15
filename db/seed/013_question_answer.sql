-- Seed app.QuestionAnswer — ALL rows from docs/source/analysis/access-database.md §4 (tblInterviewQuestionsAnswers).
-- Idempotent: inserts only missing ids; original IDs preserved via IDENTITY_INSERT.
-- CreatedBy = 0 (system/migration actor; auth.User arrives with module #4).
USE ProjectManager;
GO
SET IDENTITY_INSERT app.QuestionAnswer ON;

INSERT INTO app.QuestionAnswer ([QuestionAnswerId], [ProjectId], [Question], [Answer], [Category], [Priority], [AssignedTo], [CreatedBy])
SELECT s.*
FROM (VALUES
    (1, 2, N'How soon can you complete the Notes section?', N'by 20th it will be done and dusted', NULL, NULL, NULL, 0),
    (2, 2, N'I need a little work done, are you available?', N'Yes, apart from this there is nothing else important I am doing', NULL, NULL, NULL, 0),
    (4, 2, N'Hey', N'Yes', NULL, NULL, NULL, 0),
    (5, 2, N'Another Question', N'I am answering it', NULL, NULL, NULL, 0),
    (6, 2, N'Yet another question', N'Answered not yet', NULL, NULL, NULL, 0),
    (7, 2, N'Question', N'Answer', NULL, NULL, NULL, 0),
    (8, 2, N'Another question', N'Another answer', NULL, NULL, NULL, 0),
    (9, 14, N'Question', N'Answer', NULL, NULL, NULL, 0),
    (10, NULL, N'Question', N'Answer', NULL, NULL, NULL, 0),
    (11, NULL, N'Question', N'Answer', NULL, NULL, NULL, 0),
    (12, 22, N'Question', N'Yes', NULL, NULL, NULL, 0),
    (13, 2, N'Question', N'Answer', NULL, NULL, NULL, 0)
) AS s ([QuestionAnswerId], [ProjectId], [Question], [Answer], [Category], [Priority], [AssignedTo], [CreatedBy])
WHERE NOT EXISTS (SELECT 1 FROM app.QuestionAnswer t WHERE t.[QuestionAnswerId] = s.[QuestionAnswerId]);

SET IDENTITY_INSERT app.QuestionAnswer OFF;
GO
