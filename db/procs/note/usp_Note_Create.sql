-- usp_Note_Create — insert one app.Note row; audits in-transaction; returns the new row.
-- Entity app.Note (source: tblNotes). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_Create
    @ProjectId INT,
    @Title NVARCHAR(255) = NULL,
    @Content NVARCHAR(MAX) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ProjectId IS NULL
        THROW 50004, N'VALIDATION:ProjectId is required', 1;
    BEGIN TRAN;

    INSERT INTO app.Note ([ProjectId], [Title], [Content], CreatedBy)
    VALUES (@ProjectId, @Title, @Content, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Note', CAST(@Id AS NVARCHAR(64)),
            (SELECT NoteId, [ProjectId], [Title], [Content]
             FROM app.Note WHERE NoteId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT NoteId,
           [ProjectId],
           [Title],
           [Content],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Note
    WHERE NoteId = @Id;
END;
GO
