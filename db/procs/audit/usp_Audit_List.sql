-- usp_Audit_List — the audit log, newest first, paged per ADR-0016. Admin only (FORBIDDEN_ROW):
-- it shows every change in every project. Search columns: Action, EntityName and the actor's
-- Username and DisplayName; @Search without spaces also matches, so "set password" finds
-- SetPassword. Sort whitelist: OccurredAtUtc (desc by default). BeforeJson and AfterJson stay out
-- of the list because they can be large; usp_Audit_GetById returns them for one entry.
-- @ProjectId is accepted for contract uniformity but ignored. Module: admin-audit.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Audit_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'desc',
    @Page        INT           = 1,
    @PageSize    INT           = 25
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole <> N'Admin'
        THROW 50003, N'FORBIDDEN_ROW:Only administrators can view the audit log', 1;

    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'asc' THEN 'asc' ELSE 'desc' END;

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');
    DECLARE @Compact NVARCHAR(100) = REPLACE(@Search, N' ', N'');

    SELECT a.AuditLogId, a.ActorUserId, u.DisplayName AS ActorName, u.Username AS ActorUsername,
           a.Action, a.EntityName, a.EntityId, a.IpAddress, a.OccurredAtUtc,
           TotalCount = COUNT(*) OVER ()
    FROM audit.AuditLog a
    LEFT JOIN auth.[User] u ON u.UserId = a.ActorUserId
    WHERE @Search IS NULL
       OR a.Action LIKE N'%' + @Search + N'%' ESCAPE N'\'
       OR a.Action LIKE N'%' + @Compact + N'%' ESCAPE N'\'
       OR a.EntityName LIKE N'%' + @Search + N'%' ESCAPE N'\'
       OR a.EntityName LIKE N'%' + @Compact + N'%' ESCAPE N'\'
       OR u.Username LIKE N'%' + @Search + N'%' ESCAPE N'\'
       OR u.DisplayName LIKE N'%' + @Search + N'%' ESCAPE N'\'
    ORDER BY
        CASE WHEN @SortBy = N'OccurredAtUtc' AND @SortDir = 'asc' THEN a.AuditLogId END ASC,
        a.AuditLogId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
