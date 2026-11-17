-- usp_Licence_Get — the mirrored licence state of one PC (no row: never licensed here).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Licence_Get
    @MachineHash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT State FROM app.LicenceState WHERE MachineHash = @MachineHash;
END;
GO
