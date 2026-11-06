-- 066_stakeholder_matrix.sql — the stakeholder power/interest matrix.
--   app.Stakeholder gains [Power] and [Interest] TINYINT, 0 to 100, and [Stance] NVARCHAR(20).
--   A stakeholder with no power or interest is not on the grid; one with no stance is on the grid
--   but left out of the alignment index. All three start NULL, so every existing row is unplaced.
--   Stance is a fixed set, not a managed list (ADR-0022): the alignment index scores each code
--   (Champion 1, Supporter 0.8, Neutral 0.5, Critic 0.2, Blocker 0), so renaming one would change
--   what the index means. The labels shown live in the app's messages.
--   Each CHECK passes NULL, which is the unplaced or unset state.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Stakeholder', N'Power') IS NULL
    ALTER TABLE app.Stakeholder ADD [Power] TINYINT NULL
        CONSTRAINT CK_Stakeholder_Power CHECK ([Power] BETWEEN 0 AND 100);
GO

IF COL_LENGTH(N'app.Stakeholder', N'Interest') IS NULL
    ALTER TABLE app.Stakeholder ADD [Interest] TINYINT NULL
        CONSTRAINT CK_Stakeholder_Interest CHECK ([Interest] BETWEEN 0 AND 100);
GO

IF COL_LENGTH(N'app.Stakeholder', N'Stance') IS NULL
    ALTER TABLE app.Stakeholder ADD [Stance] NVARCHAR(20) NULL
        CONSTRAINT CK_Stakeholder_Stance
            CHECK ([Stance] COLLATE Latin1_General_BIN2 IN (N'Champion', N'Supporter', N'Neutral', N'Critic', N'Blocker'));
GO
