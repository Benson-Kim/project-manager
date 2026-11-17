-- 079_licence_state.sql — the desktop licence state, one row per PC.
--   The desktop app keeps its licence state in an encrypted file and mirrors it here so a reinstall
--   restores the same licence instead of starting a new trial. State holds the signed licence, the
--   last signed check-in and the sealed time mark as JSON; the app verifies all three on read, so an
--   edited row is ignored, never trusted.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF OBJECT_ID(N'app.LicenceState', N'U') IS NULL
    CREATE TABLE app.LicenceState (
        MachineHash CHAR(64)       NOT NULL CONSTRAINT PK_LicenceState PRIMARY KEY,
        State       NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_LicenceState_Json CHECK (ISJSON(State) = 1),
        UpdatedAt   DATETIME2(0)   NOT NULL CONSTRAINT DF_LicenceState_UpdatedAt DEFAULT SYSUTCDATETIME()
    );
GO
