-- Assign migrated to-dos and alerts to a real account after auth seeding.
-- Source rows use CreatedBy = 0 because users did not exist when data was
-- imported. Prefer the bootstrap admin, then any active Admin as a fallback.
USE ProjectManager;
GO

DECLARE @MigratedOwnerUserId INT =
(
    SELECT TOP (1) u.UserId
    FROM auth.[User] u
    INNER JOIN auth.[Role] r ON r.RoleId = u.RoleId
    WHERE u.IsDeleted = 0
      AND u.IsActive = 1
      AND r.Name = N'Admin'
    ORDER BY CASE WHEN u.Username = N'admin' THEN 0 ELSE 1 END, u.UserId
);

IF @MigratedOwnerUserId IS NULL
BEGIN
    PRINT N'WARNING: migrated to-dos remain unassigned because no active Admin user exists.';
END
ELSE
BEGIN
    UPDATE app.TodoItem
    SET CreatedBy = @MigratedOwnerUserId
    WHERE CreatedBy = 0;

    UPDATE app.TodoAlert
    SET CreatedBy = @MigratedOwnerUserId
    WHERE CreatedBy = 0;
END;
GO
