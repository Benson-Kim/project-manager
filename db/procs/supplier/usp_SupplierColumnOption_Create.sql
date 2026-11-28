-- usp_SupplierColumnOption_Create — add a choice at the end of a choice column's list (ADR-0067).
-- Access: Manager + suppliers:create. At most 50 live choices; labels unique ignoring case.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_SupplierColumnOption_Create
    @SupplierColumnId INT,
    @Label               NVARCHAR(200),
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ProjectId INT, @Kind VARCHAR(20);
    SELECT @ProjectId = ProjectId, @Kind = Kind
    FROM app.SupplierColumn WHERE SupplierColumnId = @SupplierColumnId AND IsDeleted = 0;
    IF @ProjectId IS NULL
        THROW 50001, N'NOT_FOUND:Column not found', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Manager', @Permission = N'suppliers:create', @AllowProjectless = 0;

    IF @Kind <> 'choice'
        THROW 50004, N'VALIDATION:Only a choice list has choices', 1;
    SET @Label = TRIM(@Label);
    IF @Label IS NULL OR LEN(@Label) = 0 OR LEN(@Label) > 80
        THROW 50004, N'VALIDATION:A choice has 1 to 80 characters', 1;

    BEGIN TRAN;

    DECLARE @Locked INT;
    SELECT @Locked = SupplierColumnId FROM app.SupplierColumn WITH (UPDLOCK, HOLDLOCK)
    WHERE SupplierColumnId = @SupplierColumnId;

    IF (SELECT COUNT(*) FROM app.SupplierColumnOption
        WHERE SupplierColumnId = @SupplierColumnId AND IsDeleted = 0) >= 50
        THROW 50004, N'VALIDATION:A choice list has at most 50 choices', 1;
    IF EXISTS (SELECT 1 FROM app.SupplierColumnOption
               WHERE SupplierColumnId = @SupplierColumnId AND IsDeleted = 0
                 AND UPPER(Label) = UPPER(@Label))
        THROW 50005, N'DUPLICATE:This list already has that choice', 1;

    DECLARE @Sort INT = 1 + ISNULL((SELECT MAX(SortOrder) FROM app.SupplierColumnOption
                                    WHERE SupplierColumnId = @SupplierColumnId AND IsDeleted = 0), 0);
    INSERT INTO app.SupplierColumnOption (SupplierColumnId, ProjectId, Label, SortOrder, CreatedBy)
    VALUES (@SupplierColumnId, @ProjectId, @Label, @Sort, @ActorUserId);
    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.SupplierColumnOption', CAST(@Id AS NVARCHAR(64)),
            (SELECT @SupplierColumnId AS columnId, @Label AS label FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT SupplierColumnOptionId AS id, Label AS label, CAST(RowVer AS BIGINT) AS rowVer
    FROM app.SupplierColumnOption WHERE SupplierColumnOptionId = @Id;
END;
GO
