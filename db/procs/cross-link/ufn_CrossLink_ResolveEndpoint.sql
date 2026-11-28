-- ufn_CrossLink_ResolveEndpoint — resolves a cross-link or page-note endpoint against its live
-- entity table and live app.Project (IsDeleted = 0), returning 0 rows when the target is absent,
-- deleted, or structurally invalid for its module.
-- Never trusts stored ProjectId on entities that can move between projects or standalone
-- (app.Board, app.TodoItem, app.DailyActivity, app.Note), and delegates Todo/Board access to
-- ufn_TodoItem_AccessLevel and ufn_Board_AccessLevel (ADR-0074).
-- @ActorRole must come from dbo.usp_User_GetActorRole. Procs only; app never calls it.
USE ProjectManager;
GO
CREATE OR ALTER FUNCTION dbo.ufn_CrossLink_ResolveEndpoint
(
    @ModuleKey       NVARCHAR(40),
    @StoredProjectId INT,
    @EntityId        INT,
    @SubEntityId     INT,
    @AnchorKey       NVARCHAR(80),
    @ActorRole       NVARCHAR(50),
    @ActorUserId     INT
)
RETURNS TABLE
AS
RETURN
    -- 1-2. Global personal spaces: dashboard & reports
    SELECT CAST(NULL AS INT) AS LiveProjectId, acc.AccessLevel, CAST(1 AS BIT) AS IsGlobalPersonal
    FROM dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, NULL, 1) acc
    WHERE @ModuleKey IN (N'dashboard', N'reports')
      AND @StoredProjectId IS NULL AND @EntityId IS NULL AND @SubEntityId IS NULL

    UNION ALL

    -- 3. Project overview & 32. Financials project-math (project page only, no entity)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey IN (N'project-overview', N'financials-project-math')
      AND @StoredProjectId IS NOT NULL AND @EntityId IS NULL AND @SubEntityId IS NULL
      AND p.ProjectId = @StoredProjectId AND p.IsDeleted = 0

    UNION ALL

    -- 4. objectives
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Objective e ON e.ObjectiveId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'objectives'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.ObjectiveId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 5. requirements
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Requirement e ON e.RequirementId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'requirements'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.RequirementId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 6. deliverables & 8. deliverables-gantt
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.KeyDeliverable e ON e.KeyDeliverableId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey IN (N'deliverables', N'deliverables-gantt')
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.KeyDeliverableId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 7. deliverables-canvas (optional RequirementCanvas + optional Requirement inspector subentity)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.RequirementCanvas c ON c.RequirementCanvasId = @EntityId AND c.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'deliverables-canvas'
      AND @StoredProjectId IS NOT NULL
      AND (@EntityId IS NOT NULL OR @SubEntityId IS NULL)
      AND (@EntityId IS NULL OR c.RequirementCanvasId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE c.ProjectId END
      AND p.IsDeleted = 0
      AND (@SubEntityId IS NULL OR @AnchorKey = CONCAT(N'requirement:', @SubEntityId))
      AND (@SubEntityId IS NULL OR EXISTS (
          SELECT 1 FROM app.Requirement r
          WHERE r.RequirementId = @SubEntityId AND r.ProjectId = p.ProjectId AND r.IsDeleted = 0
      ))

    UNION ALL

    -- 9. stakeholders & 10. stakeholders-matrix
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Stakeholder e ON e.StakeholderId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey IN (N'stakeholders', N'stakeholders-matrix')
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.StakeholderId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 11. responsibility
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.ResponsibilityMatrix e ON e.ResponsibilityMatrixId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'responsibility'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.ResponsibilityMatrixId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 12. suppliers
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Supplier e ON e.SupplierId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'suppliers'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.SupplierId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 13. keywords (project-scoped page; entity must match @StoredProjectId)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Keyword e ON e.KeywordId = @EntityId AND e.IsDeleted = 0 AND e.ProjectId = @StoredProjectId
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'keywords'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.KeywordId IS NOT NULL)
      AND p.ProjectId = @StoredProjectId
      AND p.IsDeleted = 0

    UNION ALL

    -- 14a. daily-activity (page-level)
    SELECT p.ProjectId, acc.AccessLevel, CASE WHEN @StoredProjectId IS NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
    FROM dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, @StoredProjectId, 1) acc
    LEFT JOIN app.Project p ON p.ProjectId = @StoredProjectId AND p.IsDeleted = 0
    WHERE @ModuleKey = N'daily-activity'
      AND @EntityId IS NULL AND @SubEntityId IS NULL
      AND (@StoredProjectId IS NULL OR p.ProjectId IS NOT NULL)

    UNION ALL

    -- 14b. daily-activity (entity-level, live ProjectId)
    SELECT d.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.DailyActivity d
    LEFT JOIN app.Project p ON p.ProjectId = d.ProjectId AND p.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, d.ProjectId, 1) acc
    WHERE @ModuleKey = N'daily-activity'
      AND @EntityId IS NOT NULL AND @SubEntityId IS NULL
      AND d.DailyActivityId = @EntityId AND d.IsDeleted = 0
      AND (d.ProjectId IS NULL OR p.ProjectId IS NOT NULL)

    UNION ALL

    -- 15a. todo (page-level)
    SELECT p.ProjectId, acc.AccessLevel, CASE WHEN @StoredProjectId IS NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
    FROM dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, @StoredProjectId, 1) acc
    LEFT JOIN app.Project p ON p.ProjectId = @StoredProjectId AND p.IsDeleted = 0
    WHERE @ModuleKey = N'todo'
      AND @EntityId IS NULL AND @SubEntityId IS NULL
      AND (@StoredProjectId IS NULL OR p.ProjectId IS NOT NULL)

    UNION ALL

    -- 15b. todo (entity-level, delegates to ufn_TodoItem_AccessLevel with live ProjectId)
    SELECT t.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.TodoItem t
    LEFT JOIN app.Project p ON p.ProjectId = t.ProjectId AND p.IsDeleted = 0
    CROSS APPLY dbo.ufn_TodoItem_AccessLevel(@ActorRole, @ActorUserId, t.ProjectId, t.CreatedBy) acc
    WHERE @ModuleKey = N'todo'
      AND @EntityId IS NOT NULL AND @SubEntityId IS NULL
      AND t.TodoItemId = @EntityId AND t.IsDeleted = 0
      AND (t.ProjectId IS NULL OR p.ProjectId IS NOT NULL)

    UNION ALL

    -- 16a. calendar (project page-level)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'calendar'
      AND @StoredProjectId IS NOT NULL AND @EntityId IS NULL AND @SubEntityId IS NULL
      AND p.ProjectId = @StoredProjectId AND p.IsDeleted = 0

    UNION ALL

    -- 16b. calendar (optional TodoItem entity, project-bound)
    SELECT t.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.TodoItem t
    JOIN app.Project p ON p.ProjectId = t.ProjectId AND p.IsDeleted = 0
    CROSS APPLY dbo.ufn_TodoItem_AccessLevel(@ActorRole, @ActorUserId, t.ProjectId, t.CreatedBy) acc
    WHERE @ModuleKey = N'calendar'
      AND @StoredProjectId IS NOT NULL AND @EntityId IS NOT NULL AND @SubEntityId IS NULL
      AND t.TodoItemId = @EntityId AND t.IsDeleted = 0 AND t.ProjectId IS NOT NULL

    UNION ALL

    -- 17. questions-answers
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.QuestionAnswer e ON e.QuestionAnswerId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'questions-answers'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.QuestionAnswerId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 18. parking-lot
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.ParkingLotItem e ON e.ParkingLotItemId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'parking-lot'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.ParkingLotItemId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 19. assumptions-constraints
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.AssumptionConstraint e ON e.AssumptionConstraintId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'assumptions-constraints'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.AssumptionConstraintId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 20. risks-issues
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.RiskIssue e ON e.RiskIssueId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'risks-issues'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.RiskIssueId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 21. decisions
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Decision e ON e.DecisionId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'decisions'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.DecisionId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 22. whiteboard
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Whiteboard e ON e.WhiteboardId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'whiteboard'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.WhiteboardId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 23. bpmn
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.BpmnDiagram e ON e.BpmnDiagramId = @EntityId AND e.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'bpmn'
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@EntityId IS NULL OR e.BpmnDiagramId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE e.ProjectId END
      AND p.IsDeleted = 0

    UNION ALL

    -- 24. meetings (optional Meeting + optional MeetingMinutesSection / MeetingActionItem subentity)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Meeting m ON m.MeetingId = @EntityId AND m.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'meetings'
      AND @StoredProjectId IS NOT NULL
      AND (@EntityId IS NOT NULL OR @SubEntityId IS NULL)
      AND (@EntityId IS NULL OR m.MeetingId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE m.ProjectId END
      AND p.IsDeleted = 0
      AND (
          @SubEntityId IS NULL
          OR (ISNULL(@AnchorKey, N'') LIKE N'action%' AND EXISTS (
              SELECT 1 FROM app.MeetingActionItem mai
              WHERE mai.MeetingActionItemId = @SubEntityId AND mai.MeetingId = m.MeetingId AND mai.IsDeleted = 0
          ))
          OR (ISNULL(@AnchorKey, N'') NOT LIKE N'action%' AND EXISTS (
              SELECT 1 FROM app.MeetingMinutesSection mms
              WHERE mms.MeetingMinutesSectionId = @SubEntityId AND mms.MeetingId = m.MeetingId AND mms.IsDeleted = 0
          ))
      )

    UNION ALL

    -- 25a. board (page-level)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, @StoredProjectId, 1) acc
    LEFT JOIN app.Project p ON p.ProjectId = @StoredProjectId AND p.IsDeleted = 0
    WHERE @ModuleKey = N'board'
      AND @EntityId IS NULL AND @SubEntityId IS NULL
      AND (@StoredProjectId IS NULL OR p.ProjectId IS NOT NULL)

    UNION ALL

    -- 25b. board (entity-level, delegates to ufn_Board_AccessLevel with live ProjectId + optional BoardCard)
    SELECT b.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Board b
    LEFT JOIN app.Project p ON p.ProjectId = b.ProjectId AND p.IsDeleted = 0
    CROSS APPLY dbo.ufn_Board_AccessLevel(@ActorRole, @ActorUserId, b.ProjectId, b.CreatedBy) acc
    WHERE @ModuleKey = N'board'
      AND @EntityId IS NOT NULL
      AND b.BoardId = @EntityId AND b.IsDeleted = 0
      AND (b.ProjectId IS NULL OR p.ProjectId IS NOT NULL)
      AND (@SubEntityId IS NULL OR EXISTS (
          SELECT 1 FROM app.BoardCard bc
          WHERE bc.BoardCardId = @SubEntityId AND bc.BoardId = b.BoardId AND bc.IsDeleted = 0
      ))

    UNION ALL

    -- 26. checklists (optional Checklist + optional ChecklistItem subentity)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Checklist c ON c.ChecklistId = @EntityId AND c.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'checklists'
      AND @StoredProjectId IS NOT NULL
      AND (@EntityId IS NOT NULL OR @SubEntityId IS NULL)
      AND (@EntityId IS NULL OR c.ChecklistId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE c.ProjectId END
      AND p.IsDeleted = 0
      AND (@SubEntityId IS NULL OR EXISTS (
          SELECT 1 FROM app.ChecklistItem ci
          WHERE ci.ChecklistItemId = @SubEntityId AND ci.ChecklistId = c.ChecklistId AND ci.IsDeleted = 0
      ))

    UNION ALL

    -- 27a. note (page-level)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, @StoredProjectId, 1) acc
    LEFT JOIN app.Project p ON p.ProjectId = @StoredProjectId AND p.IsDeleted = 0
    WHERE @ModuleKey = N'note'
      AND @EntityId IS NULL AND @SubEntityId IS NULL
      AND (@StoredProjectId IS NULL OR p.ProjectId IS NOT NULL)

    UNION ALL

    -- 27b. note (entity-level, live ProjectId + optional NoteTab subentity)
    SELECT n.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Note n
    LEFT JOIN app.Project p ON p.ProjectId = n.ProjectId AND p.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, n.ProjectId, 1) acc
    WHERE @ModuleKey = N'note'
      AND @EntityId IS NOT NULL
      AND n.NoteId = @EntityId AND n.IsDeleted = 0
      AND (n.ProjectId IS NULL OR p.ProjectId IS NOT NULL)
      AND (@SubEntityId IS NULL OR EXISTS (
          SELECT 1 FROM app.NoteTab nt
          WHERE nt.NoteTabId = @SubEntityId AND nt.NoteId = n.NoteId AND nt.IsDeleted = 0
      ))

    UNION ALL

    -- 28. financials-budget (optional Financial + optional FinancialLine subentity)
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Financial f ON f.FinancialId = @EntityId AND f.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey = N'financials-budget'
      AND @StoredProjectId IS NOT NULL
      AND (@EntityId IS NOT NULL OR @SubEntityId IS NULL)
      AND (@EntityId IS NULL OR f.FinancialId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE f.ProjectId END
      AND p.IsDeleted = 0
      AND (@SubEntityId IS NULL OR EXISTS (
          SELECT 1 FROM app.FinancialLine fl
          WHERE fl.FinancialLineId = @SubEntityId AND fl.FinancialId = f.FinancialId AND fl.IsDeleted = 0
      ))

    UNION ALL

    -- 29-31 & 33. financials-monitoring, financials-documents, financials-settings, financials-sheet
    SELECT p.ProjectId, acc.AccessLevel, CAST(0 AS BIT)
    FROM app.Project p
    LEFT JOIN app.Financial f ON f.FinancialId = @EntityId AND f.IsDeleted = 0
    CROSS APPLY dbo.ufn_AccessLevel_Resolve(@ActorRole, @ActorUserId, p.ProjectId, 0) acc
    WHERE @ModuleKey IN (
            N'financials-monitoring', N'financials-documents', N'financials-settings', N'financials-sheet'
          )
      AND @StoredProjectId IS NOT NULL AND @SubEntityId IS NULL
      AND (@ModuleKey <> N'financials-sheet' OR @EntityId IS NOT NULL)
      AND (@EntityId IS NULL OR f.FinancialId IS NOT NULL)
      AND p.ProjectId = CASE WHEN @EntityId IS NULL THEN @StoredProjectId ELSE f.ProjectId END
      AND p.IsDeleted = 0;
GO
