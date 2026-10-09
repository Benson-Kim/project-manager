-- usp_QuestionAnswer_List — paged/filtered list per ADR-0016.
-- Search columns: Question, Answer, AssignedTo.
-- Sort whitelist: Question, Category, Priority, AssignedTo.
-- Filter: @Category, @Priority (nullable — NULL means all).
-- Row-level access: a supplied @ProjectId must be accessible (dbo.usp_Project_AssertAccess ->
--   FORBIDDEN_ROW 50003); cross-project reads (@ProjectId NULL) return only rows of projects the
--   actor is assigned to (Admin sees all). LIKE wildcards in @Search are escaped.
-- ActorAccess (ADR-0023): the actor's access level on each row's project (dbo.ufn_AccessLevel_Resolve);
--   the datasheet uses it to decide per row whether cells are editable. The cross-project filter
--   reads the same rule: a row is listed when the actor has a level on it.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: questions-answers (#11).
-- ActorGrants / ActorRevokes (ADR-0024): the actor's per-person overrides of 'questions-answers' in the
--   row's project (dbo.ufn_Permission_Overrides), so the datasheet gates cells as the procs do.
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25,
    @Category    NVARCHAR(255) = NULL,
    @Priority    NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- The actor's role is read from auth.User, never trusted from the caller.
    DECLARE @ActorRole NVARCHAR(50);
    EXEC dbo.usp_User_GetActorRole @UserId = @ActorUserId, @Role = @ActorRole OUTPUT;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    IF @ProjectId IS NOT NULL
        EXEC dbo.usp_Project_AssertAccess
             @ProjectId = @ProjectId, @ActorUserId = @ActorUserId, @MinLevel = N'Viewer';

    IF @Search IS NOT NULL
        SET @Search = REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_');

    SELECT QuestionAnswerId,
           ProjectId,
           Question,
           Answer,
           Category,
           Priority,
           AssignedTo,
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           acc.AccessLevel AS ActorAccess,
           ov.Grants AS ActorGrants,
           ov.Revokes AS ActorRevokes,
           TotalCount = COUNT(*) OVER ()
    FROM app.QuestionAnswer
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, QuestionAnswer.ProjectId, 0) acc
    OUTER APPLY dbo.ufn_Permission_Overrides(@ActorRole, @ActorUserId, QuestionAnswer.ProjectId, N'questions-answers') ov
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@ProjectId IS NOT NULL OR acc.AccessLevel IS NOT NULL)
      AND (@Category  IS NULL OR Category  = @Category)
      AND (@Priority  IS NULL OR Priority  = @Priority)
      AND (
          @Search IS NULL
          OR Question    LIKE N'%' + @Search + N'%' ESCAPE N'\'
          OR Answer      LIKE N'%' + @Search + N'%' ESCAPE N'\'
          OR AssignedTo  LIKE N'%' + @Search + N'%' ESCAPE N'\'
      )
    ORDER BY
        CASE WHEN @SortBy = N'Question'   AND @SortDir = 'asc'  THEN Question   END ASC,
        CASE WHEN @SortBy = N'Question'   AND @SortDir = 'desc' THEN Question   END DESC,
        CASE WHEN @SortBy = N'Category'   AND @SortDir = 'asc'  THEN Category   END ASC,
        CASE WHEN @SortBy = N'Category'   AND @SortDir = 'desc' THEN Category   END DESC,
        CASE WHEN @SortBy = N'Priority'   AND @SortDir = 'asc'  THEN Priority   END ASC,
        CASE WHEN @SortBy = N'Priority'   AND @SortDir = 'desc' THEN Priority   END DESC,
        CASE WHEN @SortBy = N'AssignedTo' AND @SortDir = 'asc'  THEN AssignedTo END ASC,
        CASE WHEN @SortBy = N'AssignedTo' AND @SortDir = 'desc' THEN AssignedTo END DESC,
        QuestionAnswerId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
