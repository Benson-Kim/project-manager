-- usp_User_AssertAdminChange — the rules a change to an account's role or active state follows:
-- the actor is an active Admin, never takes their own role or access away, and never leaves the
-- system without an active Admin. Call it INSIDE the caller's transaction, before its UPDATE:
-- the UPDLOCK, HOLDLOCK read of the active Admins holds until the caller commits, so two Admins
-- demoting each other at once run one after the other and the second sees the last Admin.
-- @NewRoleId NULL = the role does not change. Module: admin-users.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_User_AssertAdminChange
    @UserId      INT,
    @ActorUserId INT,
    @NewRoleId   INT = NULL,
    @NewIsActive BIT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AdminRoleId INT = (SELECT RoleId FROM auth.Role WHERE Name = N'Admin');
    DECLARE @OtherAdmins INT, @ActorIsAdmin INT, @TargetIsAdmin INT;

    SELECT @OtherAdmins   = COUNT(CASE WHEN UserId <> @UserId THEN 1 END),
           @ActorIsAdmin  = MAX(CASE WHEN UserId = @ActorUserId THEN 1 ELSE 0 END),
           @TargetIsAdmin = MAX(CASE WHEN UserId = @UserId THEN 1 ELSE 0 END)
    FROM auth.[User] WITH (UPDLOCK, HOLDLOCK)
    WHERE RoleId = @AdminRoleId AND IsActive = 1 AND IsDeleted = 0;

    IF ISNULL(@ActorIsAdmin, 0) = 0
        THROW 50003, N'FORBIDDEN_ROW:Only administrators can manage users', 1;

    DECLARE @LosesAdmin BIT = CASE
        WHEN @NewIsActive = 0 THEN 1
        WHEN @NewRoleId IS NOT NULL AND @NewRoleId <> @AdminRoleId THEN 1
        ELSE 0 END;

    IF @UserId = @ActorUserId AND @LosesAdmin = 1
        THROW 50004, N'VALIDATION:You cannot change your own role or deactivate yourself', 1;

    IF ISNULL(@TargetIsAdmin, 0) = 1 AND @LosesAdmin = 1 AND @OtherAdmins = 0
        THROW 50004, N'VALIDATION:At least one active administrator is required', 1;
END;
GO
