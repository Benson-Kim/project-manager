-- usp_Audit_Insert — append one audit.AuditLog row for app-layer events that do
-- not run through a domain mutation proc (e.g. Login/Logout from module #4).
-- Domain procs write their audit rows inline, in the same transaction as the
-- mutation; this helper is for events without a domain transaction.
-- Audit rows are append-only: no update/delete procs exist on the audit schema.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Audit_Insert
    @ActorUserId INT           = NULL,
    @Action      NVARCHAR(50),
    @EntityName  NVARCHAR(128),
    @EntityId    NVARCHAR(64)  = NULL,
    @BeforeJson  NVARCHAR(MAX) = NULL,
    @AfterJson   NVARCHAR(MAX) = NULL,
    @IpAddress   NVARCHAR(45)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action IS NULL OR LTRIM(RTRIM(@Action)) = N''
        THROW 50004, N'VALIDATION:Action is required', 1;
    IF @EntityName IS NULL OR LTRIM(RTRIM(@EntityName)) = N''
        THROW 50004, N'VALIDATION:EntityName is required', 1;

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson, IpAddress)
    VALUES (@ActorUserId, @Action, @EntityName, @EntityId, @BeforeJson, @AfterJson, @IpAddress);

    SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS AuditLogId;
END;
GO
