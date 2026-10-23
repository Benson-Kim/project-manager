-- usp_Note_Create — create a notebook and, when @FirstTabTitle is given, its first page (ADR-0035).
-- @ProjectId NULL makes a project-less notebook in the shared space (migration 039).
-- Access: Contributor on the project, or a per-person grant (notes:create, ADR-0024); FORBIDDEN_ROW 50003.
--   Project-less: every user (dbo.ufn_AccessLevel_Resolve, @AllowProjectless = 1).
-- VALIDATION 50004: a blank title.
-- Entity app.Note (source: tblNotes). Module: notes (#14).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Note_Create
    @ProjectId     INT,
    @Title         NVARCHAR(255) = NULL,
    @FirstTabTitle NVARCHAR(255) = NULL,
    @ActorUserId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Title = NULLIF(TRIM(@Title), N'');
    IF @Title IS NULL
        THROW 50004, N'VALIDATION:Title is required', 1;

    EXEC dbo.usp_Project_AssertAccess
         @ProjectId = @ProjectId, @ActorUserId = @ActorUserId,
         @MinLevel = N'Contributor', @Permission = N'notes:create', @AllowProjectless = 1;

    BEGIN TRAN;

    INSERT INTO app.Note ([ProjectId], [Title], CreatedBy)
    VALUES (@ProjectId, @Title, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    SET @FirstTabTitle = NULLIF(TRIM(@FirstTabTitle), N'');
    IF @FirstTabTitle IS NOT NULL
        INSERT INTO app.NoteTab ([NoteId], [Title], [SortOrder], CreatedBy)
        VALUES (@Id, @FirstTabTitle, 1, @ActorUserId);

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Note', CAST(@Id AS NVARCHAR(64)),
            (SELECT NoteId, [ProjectId], [Title]
             FROM app.Note WHERE NoteId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT NoteId,
           [ProjectId],
           [Title],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Note
    WHERE NoteId = @Id;
END;
GO
