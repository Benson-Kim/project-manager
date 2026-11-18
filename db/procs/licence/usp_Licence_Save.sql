-- usp_Licence_Save — stores the licence state of one PC, replacing the previous copy. A state whose
-- time mark is older than the stored one, or has none, is ignored.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Licence_Save
    @MachineHash CHAR(64),
    @State       NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    DECLARE @NewMark BIGINT = ISNULL(TRY_CONVERT(BIGINT, JSON_VALUE(@State, '$.mark.at')), -1);
    IF EXISTS (SELECT 1 FROM app.LicenceState WITH (UPDLOCK, SERIALIZABLE)
                WHERE MachineHash = @MachineHash
                  AND ISNULL(TRY_CONVERT(BIGINT, JSON_VALUE(State, '$.mark.at')), -1) > @NewMark)
    BEGIN
        COMMIT;
        RETURN;
    END;
    UPDATE app.LicenceState WITH (UPDLOCK, SERIALIZABLE)
       SET State = @State, UpdatedAt = SYSUTCDATETIME()
     WHERE MachineHash = @MachineHash;
    IF @@ROWCOUNT = 0
        INSERT app.LicenceState (MachineHash, State) VALUES (@MachineHash, @State);
    COMMIT;
END;
GO
