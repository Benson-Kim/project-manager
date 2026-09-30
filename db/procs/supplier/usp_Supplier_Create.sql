-- usp_Supplier_Create — insert one app.Supplier row; audits in-transaction; returns the new row.
-- Actor project-scope: @ActorUserId must be an assignee of @ProjectId (FORBIDDEN_ROW 50003).
-- Admin bypass: @ActorRole = N'Admin' skips the project-scope check.
-- Entity app.Supplier (source: tbl3rdPartySupplier). Module: suppliers (#7).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Supplier_Create
    @ProjectId INT,
    @SupplierName NVARCHAR(255),
    @ContactPerson NVARCHAR(255) = NULL,
    @EmailAddress NVARCHAR(255) = NULL,
    @ContractStartDate DATETIME2 = NULL,
    @ContractEndDate DATETIME2 = NULL,
    @Rating NVARCHAR(255) = NULL,
    @Address NVARCHAR(255) = NULL,
    @ProvinceOrState NVARCHAR(255) = NULL,
    @Country NVARCHAR(255) = NULL,
    @PostalCode NVARCHAR(255) = NULL,
    @City NVARCHAR(255) = NULL,
    @ActorUserId INT,
    @ActorRole NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    IF @SupplierName IS NULL OR LTRIM(RTRIM(@SupplierName)) = N''
        THROW 50004, N'VALIDATION:SupplierName is required', 1;

    -- Row-level access: the actor must be assigned to the project they are writing into.
    -- Admin users bypass this check — they have full access to all projects.
    IF ISNULL(@ActorRole, '') <> N'Admin'
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @ProjectId AND UserId = @ActorUserId AND IsDeleted = 0
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    BEGIN TRAN;

    INSERT INTO app.Supplier ([ProjectId], [SupplierName], [ContactPerson], [EmailAddress], [ContractStartDate], [ContractEndDate], [Rating], [Address], [ProvinceOrState], [Country], [PostalCode], [City], CreatedBy)
    VALUES (@ProjectId, @SupplierName, @ContactPerson, @EmailAddress, @ContractStartDate, @ContractEndDate, @Rating, @Address, @ProvinceOrState, @Country, @PostalCode, @City, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Supplier', CAST(@Id AS NVARCHAR(64)),
            (SELECT SupplierId, [ProjectId], [SupplierName], [ContactPerson], [EmailAddress], [ContractStartDate], [ContractEndDate], [Rating], [Address], [ProvinceOrState], [Country], [PostalCode], [City]
             FROM app.Supplier WHERE SupplierId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT SupplierId,
           [ProjectId],
           [SupplierName],
           [ContactPerson],
           [EmailAddress],
           [ContractStartDate],
           [ContractEndDate],
           [Rating],
           [Address],
           [ProvinceOrState],
           [Country],
           [PostalCode],
           [City],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Supplier
    WHERE SupplierId = @Id;
END;
GO
