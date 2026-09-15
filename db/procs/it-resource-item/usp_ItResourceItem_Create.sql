-- usp_ItResourceItem_Create — insert one app.ItResourceItem row; audits in-transaction; returns the new row.
-- Entity app.ItResourceItem (source: tblITResourcePlanningDetails). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ItResourceItem_Create
    @ItResourceCategoryId INT,
    @DetailText NVARCHAR(MAX) = NULL,
    @Needed BIT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ItResourceCategoryId IS NULL
        THROW 50004, N'VALIDATION:ItResourceCategoryId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.ItResourceItem ([ItResourceCategoryId], [DetailText], [Needed], CreatedBy)
    VALUES (@ItResourceCategoryId, @DetailText, @Needed, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.ItResourceItem', CAST(@Id AS NVARCHAR(64)),
            (SELECT ItResourceItemId, [ItResourceCategoryId], [DetailText], [Needed]
             FROM app.ItResourceItem WHERE ItResourceItemId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT ItResourceItemId,
           [ItResourceCategoryId],
           [DetailText],
           [Needed],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.ItResourceItem
    WHERE ItResourceItemId = @Id;
END;
GO
