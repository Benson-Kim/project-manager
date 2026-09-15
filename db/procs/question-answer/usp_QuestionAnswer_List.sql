-- usp_QuestionAnswer_List — paged/filtered list per ADR-0016. Search columns: Question, Answer, Category. Sort whitelist: Category, Priority.
-- Entity app.QuestionAnswer (source: tblInterviewQuestionsAnswers). Module: database-schema-and-procs (#3).
USE ProjectManager;
GO
CREATE OR ALTER PROCEDURE dbo.usp_QuestionAnswer_List
    @ActorUserId INT,
    @ProjectId   INT           = NULL,
    @Search      NVARCHAR(100) = NULL,
    @SortBy      NVARCHAR(50)  = NULL,
    @SortDir     VARCHAR(4)    = 'asc',
    @Page        INT           = 1,
    @PageSize    INT           = 25
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page     = CASE WHEN @Page IS NULL OR @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize IS NULL OR @PageSize < 1 THEN 1
                         WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;
    SET @SortDir  = CASE WHEN LOWER(@SortDir) = 'desc' THEN 'desc' ELSE 'asc' END;

    SELECT QuestionAnswerId,
           [ProjectId],
           [Question],
           [Answer],
           [Category],
           [Priority],
           [AssignedTo],
           CreatedAtUtc,
           UpdatedAtUtc,
           CAST(RowVer AS BIGINT) AS RowVer,
           TotalCount = COUNT(*) OVER ()
    FROM app.QuestionAnswer
    WHERE IsDeleted = 0
      AND (@ProjectId IS NULL OR ProjectId = @ProjectId)
      AND (@Search IS NULL OR [Question] LIKE N'%' + @Search + N'%'
           OR [Answer] LIKE N'%' + @Search + N'%'
           OR [Category] LIKE N'%' + @Search + N'%')
    ORDER BY
        CASE WHEN @SortBy = N'Category' AND @SortDir = 'asc'  THEN [Category] END ASC,
        CASE WHEN @SortBy = N'Category' AND @SortDir = 'desc' THEN [Category] END DESC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'asc'  THEN [Priority] END ASC,
        CASE WHEN @SortBy = N'Priority' AND @SortDir = 'desc' THEN [Priority] END DESC,
        QuestionAnswerId ASC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
