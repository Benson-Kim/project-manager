-- usp_Audit_GetById — one audit entry with its BeforeJson and AfterJson. Admin only
-- (FORBIDDEN_ROW), checked before the lookup so an id tells a non-Admin nothing; NOT_FOUND for
-- an unknown id. Read only: audit rows are append-only. Module: admin-audit.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Audit_GetById
    @AuditLogId  BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole <> N'Admin'
        THROW 50003, N'FORBIDDEN_ROW:Only administrators can view the audit log', 1;

    IF NOT EXISTS (SELECT 1 FROM audit.AuditLog WHERE AuditLogId = @AuditLogId)
        THROW 50001, N'NOT_FOUND:Audit entry not found', 1;

    SELECT a.AuditLogId, a.ActorUserId, u.DisplayName AS ActorName, u.Username AS ActorUsername,
           a.Action, a.EntityName, a.EntityId, a.BeforeJson, a.AfterJson, a.IpAddress,
           a.OccurredAtUtc
    FROM audit.AuditLog a
    LEFT JOIN auth.[User] u ON u.UserId = a.ActorUserId
    WHERE a.AuditLogId = @AuditLogId;
END;
GO
