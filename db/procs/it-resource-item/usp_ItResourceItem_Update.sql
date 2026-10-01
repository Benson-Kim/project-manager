-- usp_ItResourceItem_Update — full-row update with rowversion concurrency (50002 CONFLICT) + in-transaction audit.
-- Entity app.ItResourceItem (source: tblITResourcePlanningDetails). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ItResourceItem_Update
    @ItResourceItemId INT,
    @ItResourceCategoryId INT,
    @DetailText NVARCHAR(MAX) = NULL,
    @Needed BIT,
    @RowVer BIGINT,
    @ActorUserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @CurrentVer BIGINT =
        (SELECT CAST(RowVer AS BIGINT) FROM app.ItResourceItem WHERE ItResourceItemId = @ItResourceItemId AND IsDeleted = 0);
    IF @CurrentVer IS NULL
        THROW 50001, N'NOT_FOUND:ItResourceItem not found', 1;
    IF @CurrentVer <> @RowVer
        THROW 50002, N'CONFLICT:ItResourceItem was modified by someone else', 1;

    BEGIN TRAN;

    DECLARE @Before NVARCHAR(MAX) =
        (SELECT ItResourceItemId, [ItResourceCategoryId], [DetailText], [Needed]
         FROM app.ItResourceItem WHERE ItResourceItemId = @ItResourceItemId
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    UPDATE app.ItResourceItem SET
        [ItResourceCategoryId] = @ItResourceCategoryId,
        [DetailText] = @DetailText,
        [Needed] = @Needed,
        UpdatedAtUtc = SYSUTCDATETIME(),
        UpdatedBy    = @ActorUserId
    WHERE ItResourceItemId = @ItResourceItemId AND IsDeleted = 0
      AND CAST(RowVer AS BIGINT) = @RowVer;
    IF @@ROWCOUNT = 0
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM app.ItResourceItem WHERE ItResourceItemId = @ItResourceItemId AND IsDeleted = 0)
            THROW 50001, N'NOT_FOUND:ItResourceItem not found', 1;
        THROW 50002, N'CONFLICT:ItResourceItem was modified by someone else', 1;
    END

    INSERT INTO audit.AuditLog (ActorUserId, Action, EntityName, EntityId, BeforeJson, AfterJson)
    VALUES (@ActorUserId, N'Update', N'app.ItResourceItem', CAST(@ItResourceItemId AS NVARCHAR(64)), @Before,
            (SELECT ItResourceItemId, [ItResourceCategoryId], [DetailText], [Needed]
             FROM app.ItResourceItem WHERE ItResourceItemId = @ItResourceItemId
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
    WHERE ItResourceItemId = @ItResourceItemId;
END;
GO
