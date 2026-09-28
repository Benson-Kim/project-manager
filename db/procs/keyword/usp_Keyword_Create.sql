-- usp_Keyword_Create — insert one app.Keyword row; audits in-transaction; returns the new row.
-- Project ownership check: @ActorUserId must be an assignee of the target project (FORBIDDEN_ROW 50003).
-- Entity app.Keyword (source: tblAcronyms → app.Keyword). Module: keywords (#8).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Keyword_Create
    @ProjectId   INT           = NULL,
    @Keyword     NVARCHAR(255),
    @Definition  NVARCHAR(255) = NULL,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Keyword IS NULL OR LTRIM(RTRIM(@Keyword)) = N''
        THROW 50004, N'VALIDATION:Keyword is required', 1;

    -- Row-level access: the actor must be assigned to the project they are writing into.
    -- Admin users bypass this via the action-layer RBAC check (role = Admin → all permissions).
    -- ProjectManagers are checked here so a PM cannot write to a project they are not on.
    IF @ProjectId IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM app.ProjectAssignee
           WHERE ProjectId = @ProjectId AND UserId = @ActorUserId
       )
        THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;

    BEGIN TRAN;

    INSERT INTO app.Keyword ([ProjectId], [Keyword], [Definition], CreatedBy)
    VALUES (@ProjectId, @Keyword, @Definition, @ActorUserId);

    DECLARE @Id INT = SCOPE_IDENTITY();

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, AfterJson)
    VALUES (@ActorUserId, N'Create', N'app.Keyword', CAST(@Id AS NVARCHAR(64)),
            (SELECT KeywordId, [ProjectId], [Keyword], [Definition]
             FROM app.Keyword WHERE KeywordId = @Id
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;

    SELECT KeywordId,
           [ProjectId],
           [Keyword],
           [Definition],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer
    FROM app.Keyword
    WHERE KeywordId = @Id;
END;
GO
