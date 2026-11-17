-- usp_Licence_Save — stores the licence state of one PC, replacing the previous copy.
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
    UPDATE app.LicenceState WITH (UPDLOCK, SERIALIZABLE)
       SET State = @State, UpdatedAt = SYSUTCDATETIME()
     WHERE MachineHash = @MachineHash;
    IF @@ROWCOUNT = 0
        INSERT app.LicenceState (MachineHash, State) VALUES (@MachineHash, @State);
    COMMIT;
END;
GO
