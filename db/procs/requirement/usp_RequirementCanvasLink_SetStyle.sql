-- usp_RequirementCanvasLink_SetStyle
-- Sets how one canvas draws one link. A NULL value keeps the canvas default; all NULL removes the
-- row. Parameters are wider than the columns so an over-long value is refused, never truncated
-- into an allowed one. A branch starts on a sibling link (same upstream) that is not itself a
-- branch; BranchAt NULL starts it at that link's label. Not versioned: the last change wins.
USE ProjectManager;
GO

CREATE OR ALTER PROCEDURE dbo.usp_RequirementCanvasLink_SetStyle
    @RequirementCanvasId INT,
    @UpstreamKind        NVARCHAR(20),
    @UpstreamId          INT,
    @DownstreamId        INT,
    @LineShape           NVARCHAR(20) = NULL,
    @LinePattern         NVARCHAR(20) = NULL,
    @StartEnd            NVARCHAR(20) = NULL,
    @EndEnd              NVARCHAR(20) = NULL,
    @LineWeight          INT          = NULL,
    @LineColour          NVARCHAR(20) = NULL,
    @Attach              NVARCHAR(20) = NULL,
    @SourceSide          NVARCHAR(20) = NULL,
    @TargetSide          NVARCHAR(20) = NULL,
    @Jumps               BIT          = NULL,
    @BranchFromId        INT          = NULL,
    @BranchAt            INT          = NULL,
    @ActorUserId         INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @RowProjectId INT;
    SELECT @RowProjectId = ProjectId
    FROM app.RequirementCanvas
    WHERE RequirementCanvasId = @RequirementCanvasId AND IsDeleted = 0;
    IF @RowProjectId IS NULL THROW 50001, N'NOT_FOUND:Canvas not found', 1;

    EXEC dbo.usp_Project_AssertAccess @ProjectId = @RowProjectId, @ActorUserId = @ActorUserId,
        @MinLevel = N'Contributor', @Permission = N'requirements:update', @AllowProjectless = 0;

    IF @UpstreamKind IS NULL OR @UpstreamKind COLLATE Latin1_General_BIN NOT IN (N'Requirement', N'Wbs')
        THROW 50004, N'VALIDATION:Unknown link kind', 1;
    IF @LineShape COLLATE Latin1_General_BIN NOT IN (N'straight', N'angled', N'curved')
        OR @LinePattern COLLATE Latin1_General_BIN NOT IN (N'solid', N'dashed', N'dotted')
        OR @StartEnd COLLATE Latin1_General_BIN NOT IN (N'none', N'arrow', N'open', N'dot')
        OR @EndEnd COLLATE Latin1_General_BIN NOT IN (N'none', N'arrow', N'open', N'dot')
        OR @Attach COLLATE Latin1_General_BIN NOT IN (N'fixed', N'floating')
        OR @SourceSide COLLATE Latin1_General_BIN NOT IN (N'top', N'right', N'bottom', N'left')
        OR @TargetSide COLLATE Latin1_General_BIN NOT IN (N'top', N'right', N'bottom', N'left')
        OR @LineWeight NOT BETWEEN 1 AND 6
        OR @BranchAt NOT BETWEEN 0 AND 100
        OR LEN(@LineColour) <> 7
        OR @LineColour COLLATE Latin1_General_BIN
            NOT LIKE N'#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
        THROW 50004, N'VALIDATION:Unknown line style', 1;
    IF @BranchAt IS NOT NULL AND @BranchFromId IS NULL
        THROW 50004, N'VALIDATION:A branch needs the line it starts on', 1;
    IF @BranchFromId = @DownstreamId
        THROW 50004, N'VALIDATION:A line cannot branch from itself', 1;

    DECLARE @Found INT;
    WITH ProjectLinks AS (
        SELECT N'Requirement' AS Kind, t.ValidatesRequirementId AS UpId, t.RequirementId AS DownId
        FROM app.Requirement AS r
        JOIN app.RequirementTrace AS t ON t.RequirementId = r.RequirementId
        JOIN app.Requirement AS u ON u.RequirementId = t.ValidatesRequirementId AND u.IsDeleted = 0
        WHERE r.ProjectId = @RowProjectId AND r.IsDeleted = 0 AND t.LinkStatus <> 'Retired'
        UNION ALL
        SELECT N'Wbs', d.KeyDeliverableId, d.RequirementId
        FROM app.Requirement AS r
        JOIN app.RequirementDeliverable AS d ON d.RequirementId = r.RequirementId
        JOIN app.KeyDeliverable AS kd ON kd.KeyDeliverableId = d.KeyDeliverableId AND kd.IsDeleted = 0
        WHERE r.ProjectId = @RowProjectId AND r.IsDeleted = 0 AND d.LinkStatus <> 'Retired'
    )
    SELECT @Found = COUNT(DISTINCT DownId)
    FROM ProjectLinks
    WHERE Kind = @UpstreamKind AND UpId = @UpstreamId
      AND (DownId = @DownstreamId OR DownId = @BranchFromId);
    IF @Found <> CASE WHEN @BranchFromId IS NULL THEN 1 ELSE 2 END
        THROW 50001, N'NOT_FOUND:Link not found', 1;

    DECLARE @Kind VARCHAR(12) = CAST(@UpstreamKind AS VARCHAR(12));

    BEGIN TRANSACTION;

    IF @BranchFromId IS NOT NULL AND (
        EXISTS (SELECT 1 FROM app.RequirementCanvasLinkStyle WITH (UPDLOCK, HOLDLOCK)
                WHERE RequirementCanvasId = @RequirementCanvasId AND UpstreamKind = @Kind
                  AND UpstreamId = @UpstreamId AND DownstreamId = @BranchFromId
                  AND BranchFromId IS NOT NULL)
        OR EXISTS (SELECT 1 FROM app.RequirementCanvasLinkStyle WITH (UPDLOCK, HOLDLOCK)
                   WHERE RequirementCanvasId = @RequirementCanvasId AND UpstreamKind = @Kind
                     AND UpstreamId = @UpstreamId AND BranchFromId = @DownstreamId))
        THROW 50004, N'VALIDATION:A branch cannot start on another branch', 1;

    IF COALESCE(@LineShape, @LinePattern, @StartEnd, @EndEnd, @LineColour, @Attach, @SourceSide,
                @TargetSide) IS NULL
       AND @LineWeight IS NULL AND @Jumps IS NULL AND @BranchFromId IS NULL
    BEGIN
        DELETE FROM app.RequirementCanvasLinkStyle
        WHERE RequirementCanvasId = @RequirementCanvasId AND UpstreamKind = @Kind
          AND UpstreamId = @UpstreamId AND DownstreamId = @DownstreamId;
    END
    ELSE
    BEGIN
        UPDATE app.RequirementCanvasLinkStyle WITH (UPDLOCK, HOLDLOCK)
        SET LineShape = @LineShape, LinePattern = @LinePattern, StartEnd = @StartEnd, EndEnd = @EndEnd,
            LineWeight = @LineWeight, LineColour = @LineColour, Attach = @Attach,
            SourceSide = @SourceSide, TargetSide = @TargetSide, Jumps = @Jumps,
            BranchFromId = @BranchFromId, BranchAt = @BranchAt, UpdatedAtUtc = SYSUTCDATETIME()
        WHERE RequirementCanvasId = @RequirementCanvasId AND UpstreamKind = @Kind
          AND UpstreamId = @UpstreamId AND DownstreamId = @DownstreamId;

        IF @@ROWCOUNT = 0
            INSERT INTO app.RequirementCanvasLinkStyle
                (RequirementCanvasId, UpstreamKind, UpstreamId, DownstreamId, LineShape, LinePattern,
                 StartEnd, EndEnd, LineWeight, LineColour, Attach, SourceSide, TargetSide, Jumps,
                 BranchFromId, BranchAt)
            VALUES
                (@RequirementCanvasId, @Kind, @UpstreamId, @DownstreamId, @LineShape, @LinePattern,
                 @StartEnd, @EndEnd, @LineWeight, @LineColour, @Attach, @SourceSide, @TargetSide, @Jumps,
                 @BranchFromId, @BranchAt);
    END;

    COMMIT TRANSACTION;

    SELECT @RowProjectId AS ProjectId;
END;
GO
