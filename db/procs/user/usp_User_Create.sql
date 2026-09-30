-- usp_User_Create — insert one auth.User row; audits in-transaction; returns the
-- new row WITHOUT PasswordHash (only usp_User_GetByUsername exposes the hash,
-- and only to the credentials authorize() path). Module: auth-and-rbac (#4).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_Create
    @Username           NVARCHAR(100),
    @PasswordHash       NVARCHAR(255),
    @DisplayName        NVARCHAR(255),
    @Email              NVARCHAR(255) = NULL,
    @RoleId             INT,
    @MustChangePassword BIT = 1,
    @ActorUserId        INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @Username IS NULL OR LTRIM(RTRIM(@Username)) = N''
        THROW 50004, N'VALIDATION:Username is required', 1;
    IF @PasswordHash IS NULL OR LTRIM(RTRIM(@PasswordHash)) = N''
        THROW 50004, N'VALIDATION:PasswordHash is required', 1;
    IF @DisplayName IS NULL OR LTRIM(RTRIM(@DisplayName)) = N''
        THROW 50004, N'VALIDATION:DisplayName is required', 1;
    IF NOT EXISTS (SELECT 1 FROM auth.Role WHERE RoleId = @RoleId)
        THROW 50004, N'VALIDATION:Unknown role', 1;
    IF EXISTS (SELECT 1 FROM auth.[User] WHERE Username = @Username AND IsDeleted = 0)
        THROW 50005, N'DUPLICATE:Username is already taken', 1;

    BEGIN TRAN;

    INSERT INTO auth.[User] (Username, PasswordHash, DisplayName, Email, RoleId, MustChangePassword, CreatedBy)
    VALUES (@Username, @PasswordHash, @DisplayName, @Email, @RoleId, @MustChangePassword, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'auth.User', CAST(@Id AS NVARCHAR(64)),
            (SELECT UserId, Username, DisplayName, Email, RoleId, IsActive, MustChangePassword
             FROM auth.[User] WHERE UserId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT UserId, Username, DisplayName, Email, RoleId, IsActive, MustChangePassword,
           FailedLoginCount, LockedUntilUtc, SessionVersion,
           CreatedAtUtc, UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM auth.[User]
    WHERE UserId = @Id;
END;
GO
