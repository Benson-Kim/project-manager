-- 058_assumption_constraint_validated_sync.sql — the register's Validated label follows the flag
-- when a release from before 053 writes the row (ADR-0054).
--   053 derives [IsValidated] from the label in the write procs, which keeps a rollback reading a
--   correct flag. The way back is not covered there: the previous release's procs write the flag
--   alone, so a record ticked or unticked while it ran returned with its old label, and 053's
--   backfill does not run twice.
--   TR_AssumptionConstraint_ValidatedSync corrects only a row whose two columns disagree, which
--   the current procs never write: a ticked flag means Yes, and an unticked one takes Yes back to
--   No. Any other label (none, No, or an option an Admin added) already agrees with an unticked
--   flag and is left alone. Rows the current procs write are never touched, so their RowVer and
--   audit are as the proc left them.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

CREATE OR ALTER TRIGGER app.TR_AssumptionConstraint_ValidatedSync
ON app.AssumptionConstraint
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([IsValidated]) RETURN;

    UPDATE ac
    SET [Validated] = CASE WHEN i.[IsValidated] = 1 THEN N'Yes' ELSE N'No' END
    FROM app.AssumptionConstraint AS ac
    JOIN inserted AS i ON i.AssumptionConstraintId = ac.AssumptionConstraintId
    WHERE (i.[IsValidated] = 1 AND (i.[Validated] IS NULL OR i.[Validated] <> N'Yes'))
       OR (i.[IsValidated] = 0 AND i.[Validated] = N'Yes');
END;
GO
