-- usp_NoteTab_Create — insert one app.NoteTab row; audits in-transaction; returns the new row.
-- Entity app.NoteTab (source: (new — titled tabs per checklist rows 17-20)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_Create
    @NoteId INT,
    @Title NVARCHAR(255) = NULL,
    @Content NVARCHAR(MAX) = NULL,
    @SortOrder INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @NoteId IS NULL
        THROW 50004, N'VALIDATION:NoteId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.NoteTab ([NoteId], [Title], [Content], [SortOrder], CreatedBy)
    VALUES (@NoteId, @Title, @Content, @SortOrder, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.NoteTab', CAST(@Id AS NVARCHAR(64)),
            (SELECT NoteTabId, [NoteId], [Title], [Content], [SortOrder]
             FROM app.NoteTab WHERE NoteTabId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT NoteTabId,
           [NoteId],
           [Title],
           [Content],
           [SortOrder],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.NoteTab
    WHERE NoteTabId = @Id;
END;
GO
