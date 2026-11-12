-- usp_Checklist_AssertName — a checklist name must be non-empty, at most 120 characters and unused
--   by another live checklist of the project (ADR-0066). Internal: runs inside the create and rename
--   procs' transaction, after their access check, under their lock on the project row.
-- THROW 50004 VALIDATION : empty or too long. THROW 50005 DUPLICATE : the name is taken.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Checklist_AssertName
    @ProjectId   INT,
    @ChecklistId INT = NULL,
    @Name        NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    IF @Name IS NULL OR LEN(@Name) = 0
        THROW 50004, N'VALIDATION:Give the checklist a name', 1;
    IF LEN(@Name) > 120
        THROW 50004, N'VALIDATION:A checklist name has at most 120 characters', 1;
    IF EXISTS (SELECT 1 FROM app.Checklist
               WHERE ProjectId = @ProjectId AND Name = @Name AND IsDeleted = 0
                 AND (@ChecklistId IS NULL OR ChecklistId <> @ChecklistId))
        THROW 50005, N'DUPLICATE:This project already has a checklist with that name', 1;
END;
GO
