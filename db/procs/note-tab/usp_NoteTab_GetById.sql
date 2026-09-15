-- usp_NoteTab_GetById — fetch one active app.NoteTab row; THROW 50001 when absent/soft-deleted.
-- Entity app.NoteTab (source: (new — titled tabs per checklist rows 17-20)). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_NoteTab_GetById
    @NoteTabId INT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM app.NoteTab WHERE NoteTabId = @NoteTabId AND IsDeleted = 0)
        THROW 50001, N'NOT_FOUND:NoteTab not found', 1;

    SELECT NoteTabId,
           [NoteId],
           [Title],
           [Content],
           [SortOrder],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.NoteTab
    WHERE NoteTabId = @NoteTabId AND IsDeleted = 0;
END;
GO
