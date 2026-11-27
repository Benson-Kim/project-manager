// Behaviour checks for 1-to-1 cross-links and small page notes (ADR-0074):
// - Links and page notes are personal: only the creator sees, edits or deletes one, with no Admin
//   or Manager override. Create needs Contributor+ on both live ends; delete needs Viewer+ on the
//   live ends, and an end whose record or project is gone does not block the creator.
// - ADR-0040 existence-oracle non-disclosure (missing, soft-deleted, or no-access collapses to 50001;
//   ListForLocation silently omits pairs where either end is unreadable).
// - Live-project resolution across usp_Board_SetProject, usp_TodoItem_Update, usp_DailyActivity_Update.
// - Per-creator live caps (links 25 per place / 500 per project, notes 20 / 500) under ordered
//   sp_getapplock + RowVer 50002 + AuditLog; a canvas sub-entity must match its anchor key.
// Runs as pm_web (EXECUTE-only) against ProjectManager_t1028 or CI ProjectManager.
require("./support/test-env.cjs");
const sql = require("mssql");

const ADMIN = 1;
const PM = 3;
const CONTRIB = 4;
const VIEWER = 5;
let pool;
let passes = 0;
let failures = 0;

async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  return (await req.execute(proc)).recordsets;
}

async function one(proc, params) {
  const [[row]] = await exec(proc, params);
  return row;
}

function ok(cond, label) {
  if (cond) passes++;
  else {
    failures++;
    console.log("FAIL", label);
  }
}

async function expectCode(code, label, fn) {
  try {
    await fn();
    ok(false, `${label}: expected ${code}, got success`);
  } catch (e) {
    ok(e.number === code, `${label}: expected ${code}, got ${e.number} ${e.message}`);
  }
}

const createProject = (name, actor = PM) =>
  one("usp_Project_Create", {
    ProjectName: name,
    A1: 0,
    DA: 0,
    DAS: 0,
    DO: 0,
    PurchaseEquipment: 0,
    SimilarProject: 0,
    ActorUserId: actor,
  });

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost",
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 300000,
  });

  const stamp = `cl${Date.now().toString(36)}`;
  const createdProjects = [];
  const cleanupCrossLinks = [];
  const cleanupPageNotes = [];
  const cleanupBoards = [];
  const cleanupTodos = [];
  const cleanupActivities = [];
  const cleanupNotes = [];
  let outsiderId = null;

  try {
    const [roles] = await exec("usp_Role_List", {});
    const USER_ROLE = roles.find((r) => r.Name === "User").RoleId;

    const outsider = await one("usp_User_Create", {
      Username: `${stamp}-out`,
      PasswordHash: "placeholder-not-a-hash",
      DisplayName: "Outsider",
      Email: null,
      RoleId: USER_ROLE,
      MustChangePassword: true,
      ActorUserId: ADMIN,
    });
    outsiderId = outsider.UserId;

    // P1: PM=Manager, CONTRIB=Contributor, VIEWER=Viewer (outsider has no access)
    const p1 = await createProject(`${stamp}-P1`, PM);
    createdProjects.push({ id: p1.ProjectId, actor: PM });
    await exec("usp_ProjectAssignee_Set", {
      ProjectId: p1.ProjectId,
      AssigneesJson: JSON.stringify([
        { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
        { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
        { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
      ]),
      ActorUserId: PM,
    });

    // P2: PM=Viewer, CONTRIB=Contributor, outsider=Manager (VIEWER has no access)
    const p2 = await createProject(`${stamp}-P2`, ADMIN);
    createdProjects.push({ id: p2.ProjectId, actor: ADMIN });
    await exec("usp_ProjectAssignee_Set", {
      ProjectId: p2.ProjectId,
      AssigneesJson: JSON.stringify([
        { role: "Project manager", personName: "out", userId: outsiderId, accessLevel: "Manager" },
        { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
        { role: "Team member", personName: "pm", userId: PM, accessLevel: "Viewer" },
      ]),
      ActorUserId: ADMIN,
    });

    // P3: outsider=Manager ONLY (PM, CONTRIB, VIEWER are non-members)
    const p3 = await createProject(`${stamp}-P3`, ADMIN);
    createdProjects.push({ id: p3.ProjectId, actor: ADMIN });
    await exec("usp_ProjectAssignee_Set", {
      ProjectId: p3.ProjectId,
      AssigneesJson: JSON.stringify([
        { role: "Project manager", personName: "out", userId: outsiderId, accessLevel: "Manager" },
      ]),
      ActorUserId: ADMIN,
    });

    const d1 = await one("usp_Decision_Create", {
      ProjectId: p1.ProjectId,
      Title: `${stamp} Decision 1`,
      ActorUserId: PM,
    });
    const d1b = await one("usp_Decision_Create", {
      ProjectId: p1.ProjectId,
      Title: `${stamp} Decision 1b`,
      ActorUserId: PM,
    });
    const d2 = await one("usp_Decision_Create", {
      ProjectId: p2.ProjectId,
      Title: `${stamp} Decision 2`,
      ActorUserId: outsiderId,
    });
    const d3 = await one("usp_Decision_Create", {
      ProjectId: p3.ProjectId,
      Title: `${stamp} Decision 3`,
      ActorUserId: outsiderId,
    });

    // 1. Actor validation + input invariants.
    await expectCode(50003, "unknown actor rejected on ListForLocation", () =>
      exec("usp_CrossLink_ListForLocation", {
        ModuleKey: "decisions",
        ProjectId: p1.ProjectId,
        EntityId: null,
        ActorUserId: -9999,
      }),
    );
    await expectCode(50004, "self-link rejected", () =>
      one("usp_CrossLink_Create", {
        EndAModule: "decisions",
        EndAProjectId: p1.ProjectId,
        EndAEntityId: d1.DecisionId,
        EndAAnchorKind: "record",
        EndAAnchorKey: `row:${d1.DecisionId}`,
        EndALabel: "D1",
        EndBModule: "decisions",
        EndBProjectId: p1.ProjectId,
        EndBEntityId: d1.DecisionId,
        EndBAnchorKind: "record",
        EndBAnchorKey: `row:${d1.DecisionId}`,
        EndBLabel: "D1",
        LinkTitle: "Self",
        NoteText: null,
        Color: "yellow",
        ActorUserId: PM,
      }),
    );
    await expectCode(50004, "HTML tag rejected in cross-link title", () =>
      one("usp_CrossLink_Create", {
        EndAModule: "decisions",
        EndAProjectId: p1.ProjectId,
        EndAEntityId: d1.DecisionId,
        EndAAnchorKind: "record",
        EndAAnchorKey: `row:${d1.DecisionId}`,
        EndALabel: "D1",
        EndBModule: "decisions",
        EndBProjectId: p1.ProjectId,
        EndBEntityId: d1b.DecisionId,
        EndBAnchorKind: "record",
        EndBAnchorKey: `row:${d1b.DecisionId}`,
        EndBLabel: "D1b",
        LinkTitle: "<script>alert(1)</script>",
        NoteText: null,
        Color: "yellow",
        ActorUserId: PM,
      }),
    );

    // 2. Policy 1 (Mutual Contributor+ on Create) + ADR-0040 50001 non-disclosure.
    await expectCode(50003, "Policy 1: Manager on P1 + Viewer on P2 refused 50003", () =>
      one("usp_CrossLink_Create", {
        EndAModule: "decisions",
        EndAProjectId: p1.ProjectId,
        EndAEntityId: d1.DecisionId,
        EndAAnchorKind: "record",
        EndAAnchorKey: `row:${d1.DecisionId}`,
        EndALabel: "D1",
        EndBModule: "decisions",
        EndBProjectId: p2.ProjectId,
        EndBEntityId: d2.DecisionId,
        EndBAnchorKind: "record",
        EndBAnchorKey: `row:${d2.DecisionId}`,
        EndBLabel: "D2",
        LinkTitle: "Denied",
        NoteText: null,
        Color: "yellow",
        ActorUserId: PM,
      }),
    );
    await expectCode(50001, "ADR-0040: Manager on P1 + non-member on P3 collapses to 50001", () =>
      one("usp_CrossLink_Create", {
        EndAModule: "decisions",
        EndAProjectId: p1.ProjectId,
        EndAEntityId: d1.DecisionId,
        EndAAnchorKind: "record",
        EndAAnchorKey: `row:${d1.DecisionId}`,
        EndALabel: "D1",
        EndBModule: "decisions",
        EndBProjectId: p3.ProjectId,
        EndBEntityId: d3.DecisionId,
        EndBAnchorKind: "record",
        EndBAnchorKey: `row:${d3.DecisionId}`,
        EndBLabel: "D3",
        LinkTitle: "Oracle Probe",
        NoteText: null,
        Color: "yellow",
        ActorUserId: PM,
      }),
    );
    await expectCode(50001, "ADR-0040: Manager on P1 + fake EntityId in P3 returns identical 50001", () =>
      one("usp_CrossLink_Create", {
        EndAModule: "decisions",
        EndAProjectId: p1.ProjectId,
        EndAEntityId: d1.DecisionId,
        EndAAnchorKind: "record",
        EndAAnchorKey: `row:${d1.DecisionId}`,
        EndALabel: "D1",
        EndBModule: "decisions",
        EndBProjectId: p3.ProjectId,
        EndBEntityId: 9999999,
        EndBAnchorKind: "record",
        EndBAnchorKey: "row:9999999",
        EndBLabel: "Missing",
        LinkTitle: "Oracle Probe 2",
        NoteText: null,
        Color: "yellow",
        ActorUserId: PM,
      }),
    );

    // CONTRIB is Contributor on both P1 and P2 -> Create succeeds!
    const link12 = await one("usp_CrossLink_Create", {
      EndAModule: "decisions",
      EndAProjectId: p1.ProjectId,
      EndAEntityId: d1.DecisionId,
      EndAAnchorKind: "record",
      EndAAnchorKey: `row:${d1.DecisionId}`,
      EndALabel: "Decision 1",
      EndBModule: "decisions",
      EndBProjectId: p2.ProjectId,
      EndBEntityId: d2.DecisionId,
      EndBAnchorKind: "record",
      EndBAnchorKey: `row:${d2.DecisionId}`,
      EndBLabel: "Decision 2",
      LinkTitle: `${stamp} Link 1-2`,
      NoteText: "x < y is valid plain text",
      Color: "blue",
      ActorUserId: CONTRIB,
    });
    cleanupCrossLinks.push(link12);
    ok(Boolean(link12 && link12.CrossLinkId > 0), "Contributor on P1+P2 creates cross-link");

    // Same-page link returns both Side A and Side B entries.
    const samePageLink = await one("usp_CrossLink_Create", {
      EndAModule: "decisions",
      EndAProjectId: p1.ProjectId,
      EndAEntityId: d1.DecisionId,
      EndAAnchorKind: "record",
      EndAAnchorKey: `row:${d1.DecisionId}`,
      EndALabel: "D1",
      EndBModule: "decisions",
      EndBProjectId: p1.ProjectId,
      EndBEntityId: d1b.DecisionId,
      EndBAnchorKind: "record",
      EndBAnchorKey: `row:${d1b.DecisionId}`,
      EndBLabel: "D1b",
      LinkTitle: `${stamp} SamePage`,
      NoteText: null,
      Color: "yellow",
      ActorUserId: PM,
    });
    cleanupCrossLinks.push(samePageLink);
    const [p1ListAsPm] = await exec("usp_CrossLink_ListForLocation", {
      ModuleKey: "decisions",
      ProjectId: p1.ProjectId,
      EntityId: null,
      ActorUserId: PM,
    });
    ok(
      !p1ListAsPm.some((r) => r.CrossLinkId === link12.CrossLinkId) &&
        p1ListAsPm.filter((r) => r.CrossLinkId === samePageLink.CrossLinkId).length === 2,
      "Personal: PM sees both sides of their own same-page link but not CONTRIB's P1-P2 link",
    );
    const [p1ListAsContrib] = await exec("usp_CrossLink_ListForLocation", {
      ModuleKey: "decisions",
      ProjectId: p1.ProjectId,
      EntityId: null,
      ActorUserId: CONTRIB,
    });
    ok(
      p1ListAsContrib.some((r) => r.CrossLinkId === link12.CrossLinkId && r.Side === "A") &&
        !p1ListAsContrib.some((r) => r.CrossLinkId === samePageLink.CrossLinkId),
      "Personal: CONTRIB sees their own P1-P2 link and not PM's same-page link",
    );

    // VIEWER is on P1 ONLY (not on P2) -> link12 is SILENTLY omitted from ListForLocation!
    const [p1ListAsViewer] = await exec("usp_CrossLink_ListForLocation", {
      ModuleKey: "decisions",
      ProjectId: p1.ProjectId,
      EntityId: null,
      ActorUserId: VIEWER,
    });
    ok(
      !p1ListAsViewer.some((r) => r.CrossLinkId === link12.CrossLinkId) &&
        !p1ListAsViewer.some((r) => r.CrossLinkId === samePageLink.CrossLinkId),
      "Personal: a member who created neither link sees neither",
    );
    await expectCode(50001, "ADR-0040: P1-only member calling GetById on P1-P2 link gets 50001", () =>
      one("usp_CrossLink_GetById", { CrossLinkId: link12.CrossLinkId, ActorUserId: VIEWER }),
    );
    await expectCode(50001, "ADR-0040: P1-only member calling Update with dummy RowVer gets 50001 (not 50002)", () =>
      one("usp_CrossLink_Update", {
        CrossLinkId: link12.CrossLinkId,
        LinkTitle: "Hijack",
        NoteText: null,
        Color: "yellow",
        RowVer: 1,
        ActorUserId: VIEWER,
      }),
    );

    // 3. Update concurrency + Policy 2 Delete (Manager on either end + overrides).
    const updated12 = await one("usp_CrossLink_Update", {
      CrossLinkId: link12.CrossLinkId,
      LinkTitle: `${stamp} Updated`,
      NoteText: "Edited",
      Color: "green",
      RowVer: link12.RowVer,
      ActorUserId: CONTRIB,
    });
    ok(updated12.LinkTitle === `${stamp} Updated` && updated12.Color === "green", "Contributor updates cross-link");
    await expectCode(50002, "stale RowVer throws 50002 CONFLICT", () =>
      one("usp_CrossLink_Update", {
        CrossLinkId: link12.CrossLinkId,
        LinkTitle: "Stale",
        NoteText: null,
        Color: "yellow",
        RowVer: link12.RowVer,
        ActorUserId: CONTRIB,
      }),
    );
    for (const [actor, who] of [
      [PM, "Manager on P1 who is not the creator"],
      [ADMIN, "Admin who is not the creator"],
    ]) {
      await expectCode(50001, `Personal: ${who} cannot see or delete the link (50001)`, () =>
        one("usp_CrossLink_Delete", {
          CrossLinkId: link12.CrossLinkId,
          RowVer: updated12.RowVer,
          ActorUserId: actor,
        }),
      );
      await expectCode(50001, `Personal: ${who} cannot read the link (50001)`, () =>
        one("usp_CrossLink_GetById", { CrossLinkId: link12.CrossLinkId, ActorUserId: actor }),
      );
    }
    await one("usp_CrossLink_Delete", {
      CrossLinkId: link12.CrossLinkId,
      RowVer: updated12.RowVer,
      ActorUserId: CONTRIB,
    });
    ok(true, "Personal: the Contributor who created the link deletes it");
    await expectCode(50001, "Deleted cross-link returns 50001 on GetById", () =>
      one("usp_CrossLink_GetById", { CrossLinkId: link12.CrossLinkId, ActorUserId: ADMIN }),
    );

    // Permission overrides: grant PM cross-links:create on P2 (where PM is Viewer) and verify Create works.
    await exec("usp_ProjectPermission_Set", {
      ProjectId: p2.ProjectId,
      UserId: PM,
      OverridesJson: JSON.stringify([{ module: "cross-links", verb: "create", allowed: true }]),
      ActorUserId: ADMIN,
    });
    const overrideLink = await one("usp_CrossLink_Create", {
      EndAModule: "decisions",
      EndAProjectId: p1.ProjectId,
      EndAEntityId: d1.DecisionId,
      EndAAnchorKind: "record",
      EndAAnchorKey: `row:${d1.DecisionId}`,
      EndALabel: "D1",
      EndBModule: "decisions",
      EndBProjectId: p2.ProjectId,
      EndBEntityId: d2.DecisionId,
      EndBAnchorKind: "record",
      EndBAnchorKey: `row:${d2.DecisionId}`,
      EndBLabel: "D2",
      LinkTitle: `${stamp} Override`,
      NoteText: null,
      Color: "purple",
      ActorUserId: PM,
    });
    cleanupCrossLinks.push(overrideLink);
    ok(Boolean(overrideLink.CrossLinkId > 0), "cross-links:create override allows Viewer on End B to create");

    // 4. Live-project resolution across Board, TodoItem, DailyActivity moves!
    const board = await one("usp_Board_Create", {
      ProjectId: p1.ProjectId,
      Name: `${stamp} Movable Board`,
      Description: null,
      ColumnsJson: JSON.stringify([
        { name: "To do", category: "todo" },
        { name: "Doing", category: "doing" },
        { name: "Done", category: "done" },
      ]),
      ActorUserId: PM,
    });
    cleanupBoards.push(board);
    const boardLinkArgs = {
      EndAModule: "board",
      EndAProjectId: p1.ProjectId,
      EndAEntityId: board.BoardId,
      EndAAnchorKind: "page",
      EndAAnchorKey: null,
      EndALabel: board.Name,
      EndBModule: "decisions",
      EndBProjectId: p1.ProjectId,
      EndBEntityId: d1.DecisionId,
      EndBAnchorKind: "record",
      EndBAnchorKey: `row:${d1.DecisionId}`,
      EndBLabel: "D1",
      NoteText: null,
      Color: "yellow",
    };
    const boardLink = await one("usp_CrossLink_Create", { ...boardLinkArgs, LinkTitle: `${stamp} BoardLink`, ActorUserId: PM });
    cleanupCrossLinks.push(boardLink);
    const adminBoardLink = await one("usp_CrossLink_Create", { ...boardLinkArgs, LinkTitle: `${stamp} AdminBoardLink`, ActorUserId: ADMIN });
    cleanupCrossLinks.push(adminBoardLink);

    // Move board from P1 -> P3 (where PM, CONTRIB, VIEWER have zero access!).
    await one("usp_Board_SetProject", {
      BoardId: board.BoardId,
      RowVer: board.RowVer,
      ProjectId: p3.ProjectId,
      RemoveForeignCards: 0,
      ActorUserId: ADMIN,
    });
    const [p1AfterMove] = await exec("usp_CrossLink_ListForLocation", {
      ModuleKey: "decisions",
      ProjectId: p1.ProjectId,
      EntityId: null,
      ActorUserId: PM,
    });
    ok(
      !p1AfterMove.some((r) => r.CrossLinkId === boardLink.CrossLinkId),
      "Live move: moving Board to P3 immediately hides its cross-link from P1 members",
    );
    await expectCode(50001, "Live move: the creator who cannot read P3 gets 50001 on their own moved link", () =>
      one("usp_CrossLink_GetById", { CrossLinkId: boardLink.CrossLinkId, ActorUserId: PM }),
    );
    const [boardNewLoc] = await exec("usp_CrossLink_ListForLocation", {
      ModuleKey: "board",
      ProjectId: p3.ProjectId,
      EntityId: board.BoardId,
      ActorUserId: ADMIN,
    });
    ok(
      boardNewLoc.some((r) => r.CrossLinkId === adminBoardLink.CrossLinkId && r.EndAProjectId === p3.ProjectId) &&
        !boardNewLoc.some((r) => r.CrossLinkId === boardLink.CrossLinkId),
      "Live move: the creator sees their link at P3 with EndAProjectId healed, and not the PM's link",
    );

    // TodoItem move from P1 -> standalone (NULL): PM can no longer read CONTRIB's standalone to-do.
    const todo = await one("usp_TodoItem_Create", {
      ProjectId: p1.ProjectId,
      TodoItem: `${stamp} Private Todo`,
      ActorUserId: CONTRIB,
    });
    cleanupTodos.push(todo);
    const todoLink = await one("usp_CrossLink_Create", {
      EndAModule: "todo",
      EndAProjectId: p1.ProjectId,
      EndAEntityId: todo.TodoItemId,
      EndAAnchorKind: "record",
      EndAAnchorKey: `row:${todo.TodoItemId}`,
      EndALabel: todo.TodoItem,
      EndBModule: "decisions",
      EndBProjectId: p1.ProjectId,
      EndBEntityId: d1.DecisionId,
      EndBAnchorKind: "record",
      EndBAnchorKey: `row:${d1.DecisionId}`,
      EndBLabel: "D1",
      LinkTitle: `${stamp} TodoLink`,
      NoteText: null,
      Color: "orange",
      ActorUserId: CONTRIB,
    });
    cleanupCrossLinks.push(todoLink);
    await one("usp_TodoItem_Update", {
      TodoItemId: todo.TodoItemId,
      ProjectId: null,
      DailyActivityId: null,
      ProjectOrActivity: todo.ProjectOrActivity,
      TodoItem: todo.TodoItem,
      StartDate: todo.StartDate,
      DueDate: todo.DueDate,
      Priority: todo.Priority,
      Status: todo.Status,
      Assignee: todo.Assignee,
      Notes: todo.Notes,
      RowVer: todo.RowVer,
      ActorUserId: CONTRIB,
    });
    const [p1AfterTodoMove] = await exec("usp_CrossLink_ListForLocation", {
      ModuleKey: "decisions",
      ProjectId: p1.ProjectId,
      EntityId: null,
      ActorUserId: PM,
    });
    ok(
      !p1AfterTodoMove.some((r) => r.CrossLinkId === todoLink.CrossLinkId),
      "Live move: moving TodoItem to standalone (NULL) restricts it via ufn_TodoItem_AccessLevel",
    );
    const [contribAfterTodoMove] = await exec("usp_CrossLink_ListForLocation", {
      ModuleKey: "decisions",
      ProjectId: p1.ProjectId,
      EntityId: null,
      ActorUserId: CONTRIB,
    });
    ok(
      contribAfterTodoMove.some(
        (r) => r.CrossLinkId === todoLink.CrossLinkId && r.EndAProjectId === null,
      ),
      "Live move: creator of standalone TodoItem still sees healed EndAProjectId = NULL",
    );

    // DailyActivity move from P1 -> P3
    const act = await one("usp_DailyActivity_Create", {
      ProjectId: p1.ProjectId,
      Task: `${stamp} Act`,
      ActorUserId: ADMIN,
    });
    cleanupActivities.push(act);
    const actLink = await one("usp_CrossLink_Create", {
      EndAModule: "daily-activity",
      EndAProjectId: p1.ProjectId,
      EndAEntityId: act.DailyActivityId,
      EndAAnchorKind: "record",
      EndAAnchorKey: `row:${act.DailyActivityId}`,
      EndALabel: act.Task,
      EndBModule: "decisions",
      EndBProjectId: p1.ProjectId,
      EndBEntityId: d1.DecisionId,
      EndBAnchorKind: "record",
      EndBAnchorKey: `row:${d1.DecisionId}`,
      EndBLabel: "D1",
      LinkTitle: `${stamp} ActLink`,
      NoteText: null,
      Color: "yellow",
      ActorUserId: ADMIN,
    });
    cleanupCrossLinks.push(actLink);
    await one("usp_DailyActivity_Update", {
      DailyActivityId: act.DailyActivityId,
      ProjectId: p3.ProjectId,
      ActivityStatusId: act.ActivityStatusId,
      Requester: act.Requester,
      Task: act.Task,
      MyActivity: act.MyActivity,
      ActivityDate: act.ActivityDate,
      Comments: act.Comments,
      RequestDate: act.RequestDate,
      Status: act.Status,
      CompleteDate: act.CompleteDate,
      ContactMethod: act.ContactMethod,
      TimeSpent: act.TimeSpent,
      AssignedTo: act.AssignedTo,
      TaskType: act.TaskType,
      Progress: act.Progress,
      RowVer: act.RowVer,
      ActorUserId: ADMIN,
    });
    const [p1AfterActMove] = await exec("usp_CrossLink_ListForLocation", {
      ModuleKey: "decisions",
      ProjectId: p1.ProjectId,
      EntityId: null,
      ActorUserId: PM,
    });
    ok(
      !p1AfterActMove.some((r) => r.CrossLinkId === actLink.CrossLinkId),
      "Live move: moving DailyActivity to P3 hides its cross-link from P1 PM",
    );

    // 5. Soft-deleted target entity hides cross-link.
    await exec("usp_Decision_Delete", {
      DecisionId: d1b.DecisionId,
      RowVer: d1b.RowVer,
      ActorUserId: PM,
    });
    await expectCode(50001, "Soft-deleting End B target returns 50001 on GetById", () =>
      one("usp_CrossLink_GetById", { CrossLinkId: samePageLink.CrossLinkId, ActorUserId: PM }),
    );
    await expectCode(50001, "Personal: an Admin who is not the creator cannot delete an orphaned link (50001)", () =>
      one("usp_CrossLink_Delete", { CrossLinkId: samePageLink.CrossLinkId, RowVer: samePageLink.RowVer, ActorUserId: ADMIN }),
    );
    await one("usp_CrossLink_Delete", { CrossLinkId: samePageLink.CrossLinkId, RowVer: samePageLink.RowVer, ActorUserId: PM });
    ok(true, "Personal: the creator deletes their link after one end's record is gone");

    // 6. Page Notes: Policy 3 (global-page private to creator) + project/shared RBAC + caps.
    const dashNote = await one("usp_PageNote_Create", {
      ModuleKey: "dashboard",
      ProjectId: null,
      EntityId: null,
      SubEntityId: null,
      AnchorKind: "page",
      AnchorKey: null,
      AnchorLabel: "Dashboard",
      Body: `${stamp} Private dash note`,
      Color: "yellow",
      ActorUserId: CONTRIB,
    });
    cleanupPageNotes.push(dashNote);

    const [contribDash] = await exec("usp_PageNote_ListForLocation", {
      ModuleKey: "dashboard",
      ProjectId: null,
      EntityId: null,
      ActorUserId: CONTRIB,
    });
    const [adminDash] = await exec("usp_PageNote_ListForLocation", {
      ModuleKey: "dashboard",
      ProjectId: null,
      EntityId: null,
      ActorUserId: ADMIN,
    });
    ok(
      contribDash.some((n) => n.PageNoteId === dashNote.PageNoteId) &&
        !adminDash.some((n) => n.PageNoteId === dashNote.PageNoteId),
      "Policy 3: global dashboard PageNote is private to creator (even Admin cannot read it)",
    );
    await expectCode(50001, "Policy 3: non-creator calling GetById on global PageNote gets 50001", () =>
      one("usp_PageNote_GetById", { PageNoteId: dashNote.PageNoteId, ActorUserId: PM }),
    );
    const dashUpd = await one("usp_PageNote_Update", {
      PageNoteId: dashNote.PageNoteId,
      Body: `${stamp} Updated private dash`,
      Color: "blue",
      RowVer: dashNote.RowVer,
      ActorUserId: CONTRIB,
    });
    await one("usp_PageNote_Delete", {
      PageNoteId: dashNote.PageNoteId,
      RowVer: dashUpd.RowVer,
      ActorUserId: CONTRIB,
    });

    // Shared notebook (/notes/[id], ProjectId=NULL) PageNote is team-shared.
    const sharedNote = await one("usp_Note_Create", {
      ProjectId: null,
      Title: `${stamp} Shared Notebook`,
      ActorUserId: CONTRIB,
    });
    cleanupNotes.push(sharedNote);
    const teamPageNote = await one("usp_PageNote_Create", {
      ModuleKey: "note",
      ProjectId: null,
      EntityId: sharedNote.NoteId,
      SubEntityId: null,
      AnchorKind: "page",
      AnchorKey: null,
      AnchorLabel: sharedNote.Title,
      Body: `${stamp} Shared note sticky`,
      Color: "yellow",
      ActorUserId: CONTRIB,
    });
    cleanupPageNotes.push(teamPageNote);
    const [pmSharedList] = await exec("usp_PageNote_ListForLocation", {
      ModuleKey: "note",
      ProjectId: null,
      EntityId: sharedNote.NoteId,
      ActorUserId: PM,
    });
    ok(
      !pmSharedList.some((n) => n.PageNoteId === teamPageNote.PageNoteId),
      "Personal: a page note on a shared notebook is hidden from everyone but its creator",
    );
    await expectCode(50001, "Personal: a non-creator cannot delete a shared-notebook page note (50001)", () =>
      one("usp_PageNote_Delete", {
        PageNoteId: teamPageNote.PageNoteId,
        RowVer: teamPageNote.RowVer,
        ActorUserId: PM,
      }),
    );

    // Project PageNote: Viewer refused 50003 on Create, Contributor creates, a non-creator Manager gets 50001, the creator deletes.
    await expectCode(50003, "Project PageNote: Viewer refused Create 50003", () =>
      one("usp_PageNote_Create", {
        ModuleKey: "decisions",
        ProjectId: p1.ProjectId,
        EntityId: d1.DecisionId,
        SubEntityId: null,
        AnchorKind: "record",
        AnchorKey: `row:${d1.DecisionId}`,
        AnchorLabel: "D1",
        Body: "Blocked",
        Color: "yellow",
        ActorUserId: VIEWER,
      }),
    );
    const projNote = await one("usp_PageNote_Create", {
      ModuleKey: "decisions",
      ProjectId: p1.ProjectId,
      EntityId: d1.DecisionId,
      SubEntityId: null,
      AnchorKind: "record",
      AnchorKey: `row:${d1.DecisionId}`,
      AnchorLabel: "D1",
      Body: `${stamp} Project note`,
      Color: "green",
      ActorUserId: CONTRIB,
    });
    cleanupPageNotes.push(projNote);
    await expectCode(50001, "Personal: a Manager who is not the creator cannot delete a project page note (50001)", () =>
      one("usp_PageNote_Delete", {
        PageNoteId: projNote.PageNoteId,
        RowVer: projNote.RowVer,
        ActorUserId: PM,
      }),
    );
    await one("usp_PageNote_Delete", {
      PageNoteId: projNote.PageNoteId,
      RowVer: projNote.RowVer,
      ActorUserId: CONTRIB,
    });
    ok(true, "Personal: a Contributor deletes their own project page note");

    // 7. Caps under sp_getapplock: 20 page notes per location (21st -> 50007).
    const capNotes = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        one("usp_PageNote_Create", {
          ModuleKey: "project-overview",
          ProjectId: p1.ProjectId,
          EntityId: null,
          SubEntityId: null,
          AnchorKind: "page",
          AnchorKey: null,
          AnchorLabel: "Overview",
          Body: `${stamp} cap ${i + 1}`,
          Color: "yellow",
          ActorUserId: PM,
        }),
      ),
    );
    cleanupPageNotes.push(...capNotes);
    ok(capNotes.length === 20, "20 concurrent PageNotes created cleanly under sp_getapplock");
    await expectCode(50007, "21st PageNote at same location throws 50007 LIMIT_REACHED", () =>
      one("usp_PageNote_Create", {
        ModuleKey: "project-overview",
        ProjectId: p1.ProjectId,
        EntityId: null,
        SubEntityId: null,
        AnchorKind: "page",
        AnchorKey: null,
        AnchorLabel: "Overview",
        Body: `${stamp} cap 21`,
        Color: "yellow",
        ActorUserId: PM,
      }),
    );
    const otherCreatorNote = await one("usp_PageNote_Create", {
          ModuleKey: "project-overview",
          ProjectId: p1.ProjectId,
          EntityId: null,
          SubEntityId: null,
          AnchorKind: "page",
          AnchorKey: null,
          AnchorLabel: "Overview",
          Body: `${stamp} cap other creator`,
          Color: "yellow",
          ActorUserId: CONTRIB,
        });
    cleanupPageNotes.push(otherCreatorNote);
    ok(!!otherCreatorNote.PageNoteId, "Caps are per creator: another user can still add a note at a place where PM is full");
    await one("usp_PageNote_Delete", { PageNoteId: capNotes[0].PageNoteId, RowVer: capNotes[0].RowVer, ActorUserId: PM });
    const refill = await one("usp_PageNote_Create", {
          ModuleKey: "project-overview",
          ProjectId: p1.ProjectId,
          EntityId: null,
          SubEntityId: null,
          AnchorKind: "page",
          AnchorKey: null,
          AnchorLabel: "Overview",
          Body: `${stamp} cap refill`,
          Color: "yellow",
          ActorUserId: PM,
        });
    cleanupPageNotes.push(refill);
    ok(!!refill.PageNoteId, "Caps count live notes only: deleting one frees a slot");

    // 8. Cross-link caps are per creator and count live links only.
    const capLinkArgs = {
      EndAModule: "decisions",
      EndAProjectId: p1.ProjectId,
      EndAEntityId: null,
      EndAAnchorKind: "section",
      EndAAnchorKey: "section:cap-a",
      EndALabel: "Cap A",
      EndBModule: "decisions",
      EndBProjectId: p1.ProjectId,
      EndBEntityId: null,
      EndBAnchorKind: "section",
      EndBAnchorKey: "section:cap-b",
      EndBLabel: "Cap B",
      NoteText: null,
      Color: "yellow",
    };
    const capLinks = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        one("usp_CrossLink_Create", { ...capLinkArgs, LinkTitle: `${stamp} cap link ${i + 1}`, ActorUserId: CONTRIB }),
      ),
    );
    cleanupCrossLinks.push(...capLinks);
    await expectCode(50007, "26th cross-link by the same creator at one place throws 50007", () =>
      one("usp_CrossLink_Create", { ...capLinkArgs, LinkTitle: `${stamp} cap link 26`, ActorUserId: CONTRIB }),
    );
    const otherCreatorLink = await one("usp_CrossLink_Create", { ...capLinkArgs, LinkTitle: `${stamp} cap other`, ActorUserId: PM });
    cleanupCrossLinks.push(otherCreatorLink);
    ok(!!otherCreatorLink.CrossLinkId, "Cross-link caps are per creator: another user can still link a place that is full for CONTRIB");
    await one("usp_CrossLink_Delete", { CrossLinkId: capLinks[0].CrossLinkId, RowVer: capLinks[0].RowVer, ActorUserId: CONTRIB });
    const linkRefill = await one("usp_CrossLink_Create", { ...capLinkArgs, LinkTitle: `${stamp} cap refill`, ActorUserId: CONTRIB });
    cleanupCrossLinks.push(linkRefill);
    ok(!!linkRefill.CrossLinkId, "Cross-link caps count live links only: deleting one frees a slot");

    // 9. A canvas sub-entity must match the kind its anchor key names.
    const [[canvasReq]] = await exec("usp_Requirement_Create", {
      ProjectId: p1.ProjectId, RequirementType: "BR", Requirement: `${stamp} Canvas req`, ActorUserId: PM,
    });
    const [[reqCanvas]] = await exec("usp_RequirementCanvas_Create", {
      ProjectId: p1.ProjectId, Name: `${stamp} Canvas`, KeyDeliverableId: null, ActorUserId: PM,
    });
    const canvasEnd = (anchorKey) => ({
      ...capLinkArgs,
      EndAModule: "deliverables-canvas",
      EndAEntityId: reqCanvas.RequirementCanvasId,
      EndASubEntityId: canvasReq.RequirementId,
      EndAAnchorKind: "subrecord",
      EndAAnchorKey: anchorKey,
      LinkTitle: `${stamp} canvas link`,
      ActorUserId: PM,
    });
    await expectCode(50001, "A canvas end keyed as a WBS node but carrying a requirement sub-entity is refused (50001)", () =>
      one("usp_CrossLink_Create", canvasEnd(`wbs:${canvasReq.RequirementId}`)),
    );
    const canvasLink = await one("usp_CrossLink_Create", canvasEnd(`requirement:${canvasReq.RequirementId}`));
    cleanupCrossLinks.push(canvasLink);
    ok(!!canvasLink.CrossLinkId, "A canvas end whose key matches its requirement sub-entity is accepted");

    // Cleanup check for deactivated actor.
    const outLatest = await one("usp_User_GetById", { UserId: outsiderId, ActorUserId: ADMIN });
    await exec("usp_User_Deactivate", {
      UserId: outsiderId,
      RowVer: outLatest.RowVer,
      ActorUserId: ADMIN,
    });
    outsiderId = null;
    await expectCode(50003, "deactivated actor rejected", () =>
      exec("usp_CrossLink_ListForLocation", {
        ModuleKey: "decisions",
        ProjectId: p2.ProjectId,
        EntityId: null,
        ActorUserId: outLatest.UserId,
      }),
    );
  } finally {
    const deleteLinks = async () => {
      for (const cl of cleanupCrossLinks.splice(0)) {
        const actor = cl.CreatedBy ?? ADMIN;
        let rowVer = cl.RowVer;
        try {
          rowVer = (await one("usp_CrossLink_GetById", { CrossLinkId: cl.CrossLinkId, ActorUserId: actor })).RowVer;
        } catch {}
        try {
          await one("usp_CrossLink_Delete", { CrossLinkId: cl.CrossLinkId, RowVer: rowVer, ActorUserId: actor });
        } catch {
          cleanupCrossLinks.push(cl);
        }
      }
    };
    await deleteLinks();
    for (const pn of cleanupPageNotes) {
      try {
        const cur = await one("usp_PageNote_GetById", {
          PageNoteId: pn.PageNoteId,
          ActorUserId: pn.CreatedBy || ADMIN,
        });
        await one("usp_PageNote_Delete", {
          PageNoteId: pn.PageNoteId,
          RowVer: cur.RowVer,
          ActorUserId: pn.CreatedBy || ADMIN,
        });
      } catch {}
    }
    for (const b of cleanupBoards) {
      try {
        const cur = await one("usp_Board_GetById", { BoardId: b.BoardId, ActorUserId: ADMIN });
        await exec("usp_Board_Delete", {
          BoardId: b.BoardId,
          RowVer: cur.RowVer,
          ActorUserId: ADMIN,
        });
      } catch {}
    }
    for (const t of cleanupTodos) {
      try {
        const cur = await one("usp_TodoItem_GetById", {
          TodoItemId: t.TodoItemId,
          ActorUserId: ADMIN,
        });
        await exec("usp_TodoItem_Delete", {
          TodoItemId: t.TodoItemId,
          RowVer: cur.RowVer,
          ActorUserId: ADMIN,
        });
      } catch {}
    }
    for (const a of cleanupActivities) {
      try {
        const cur = await one("usp_DailyActivity_GetById", {
          DailyActivityId: a.DailyActivityId,
          ActorUserId: ADMIN,
        });
        await exec("usp_DailyActivity_Delete", {
          DailyActivityId: a.DailyActivityId,
          RowVer: cur.RowVer,
          ActorUserId: ADMIN,
        });
      } catch {}
    }
    for (const n of cleanupNotes) {
      try {
        const cur = await one("usp_Note_GetById", { NoteId: n.NoteId, ActorUserId: ADMIN });
        await exec("usp_Note_Delete", { NoteId: n.NoteId, RowVer: cur.RowVer, ActorUserId: ADMIN });
      } catch {}
    }
    await deleteLinks();
    for (const p of createdProjects) {
      try {
        const current = await one("usp_Project_GetById", {
          ProjectId: p.id,
          ActorUserId: p.actor,
        });
        await exec("usp_Project_Delete", {
          ProjectId: p.id,
          RowVer: current.RowVer,
          ActorUserId: p.actor,
        });
      } catch {}
    }
    if (outsiderId !== null) {
      try {
        const u = await one("usp_User_GetById", { UserId: outsiderId, ActorUserId: ADMIN });
        await exec("usp_User_Deactivate", {
          UserId: outsiderId,
          RowVer: u.RowVer,
          ActorUserId: ADMIN,
        });
      } catch {}
    }
    if (pool) await pool.close();
  }

  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
