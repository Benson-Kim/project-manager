-- usp_RequirementLinkRule_Set — tick or clear one cell of the link rules (ADR-0060). App-wide, so
--   Admin only. One cell at a time: each write says what it wants, so two Admins cannot overwrite
--   each other's other cells, and repeating a write changes nothing and audits nothing.
-- Removing a rule leaves existing links alone: it applies to new links only.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_RequirementLinkRule_Set
    @DownstreamType VARCHAR(3),
    @UpstreamType   VARCHAR(3),
    @Allowed        BIT,
    @ActorUserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    IF @ActorRole IS NULL OR @ActorRole <> N'Admin'
        THROW 50003, N'FORBIDDEN_ROW:Only administrators can change the link settings', 1;

    IF @DownstreamType IS NULL OR @DownstreamType NOT IN ('BR', 'SR', 'FR', 'NFR', 'TR', 'TC')
       OR @UpstreamType IS NULL OR @UpstreamType NOT IN ('WBS', 'BR', 'SR', 'FR', 'NFR', 'TR', 'TC')
       OR @Allowed IS NULL
        THROW 50004, N'VALIDATION:Pick a link rule', 1;

    BEGIN TRANSACTION;

    DECLARE @Had BIT = CASE WHEN EXISTS (SELECT 1 FROM app.RequirementLinkRule WITH (UPDLOCK, HOLDLOCK)
                                         WHERE DownstreamType = @DownstreamType
                                           AND UpstreamType = @UpstreamType)
                            THEN 1 ELSE 0 END;

    IF @Allowed = 1 AND @Had = 0
        INSERT INTO app.RequirementLinkRule (DownstreamType, UpstreamType, CreatedBy)
        VALUES (@DownstreamType, @UpstreamType, @ActorUserId);
    ELSE IF @Allowed = 0 AND @Had = 1
        DELETE FROM app.RequirementLinkRule
        WHERE DownstreamType = @DownstreamType AND UpstreamType = @UpstreamType;

    IF @Allowed <> @Had
        INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
        VALUES (@ActorUserId, N'SetLinkRule', N'app.RequirementLinkRule',
                CAST(@DownstreamType + N'>' + @UpstreamType AS NVARCHAR(64)),
                (SELECT @Had AS allowed FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                (SELECT @Allowed AS allowed FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));

    COMMIT;
END;
GO
