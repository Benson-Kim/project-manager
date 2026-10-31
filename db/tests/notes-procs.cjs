// Behaviour checks for the notebook procs (ADR-0035 and its 2026-10-23 amendment): the
// project-less shared space, where every user reads, creates and edits notebooks and their pages
// and only an Admin deletes, next to project notebooks that keep their project's levels; and the
// cross-project list, which returns the actor's projects plus the shared space, filters to the
// shared space alone, and names each row's project. Runs against the seeded database in the CI
// db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer) and
// locally: node db/tests/notes-procs.cjs. Creates a throwaway project and leaves soft-deleted rows
// behind, so never point it at a real database.
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (a .env file fills what is missing).
try {
  require("fs")
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .forEach((l) => {
      const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
} catch {
  // No .env: the environment must carry the DB_* values (CI).
}
const sql = require("mssql");

const ADMIN = 1;
const PM = 3;
const OUTSIDER = 4;
const VIEWER = 5;
let pool;
let failures = 0;
let passes = 0;

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
async function project(name) {
  const row = await one("usp_Project_Create", {
    ProjectName: name, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0, Requisition: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
const notebook = (projectId, title, actor) =>
  one("usp_Note_Create", { ProjectId: projectId, Title: title, FirstTabTitle: "Page 1", ActorUserId: actor });
const workspace = (noteId, actor) => one("usp_Note_GetWithTabs", { NoteId: noteId, ActorUserId: actor });
const pagesOf = (ws) => JSON.parse(ws.TabsJson || "[]");
async function list(actor, params = {}) {
  const [rows] = await exec("usp_Note_List", {
    ActorUserId: actor, ProjectId: null, Search: null, SortBy: null, SortDir: "asc",
    Page: 1, PageSize: 100, WithoutProject: 0, ...params,
  });
  return rows;
}

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const stamp = `notes-${Date.now()}`;
  const P = await project(`${stamp}-p`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });

  // The shared space: a project Viewer creates there; a user on no project reads and edits it.
  const shared = await notebook(null, `${stamp} shared`, VIEWER);
  ok(shared.ProjectId === null, "a notebook without a project is stored without one");
  let ws = await workspace(shared.NoteId, OUTSIDER);
  ok(pagesOf(ws).length === 1, "anyone reads the shared notebook and its first page");
  const renamed = await one("usp_Note_Update", {
    NoteId: shared.NoteId, Title: `${stamp} shared renamed`, RowVer: ws.RowVer, ActorUserId: OUTSIDER,
  });
  ok(renamed.Title === `${stamp} shared renamed`, "anyone renames the shared notebook");
  const first = pagesOf(ws)[0];
  const saved = await one("usp_NoteTab_Update", {
    NoteTabId: first.NoteTabId, Title: "Agenda", Content: "<p>Shared text</p>",
    SearchText: "Shared text", RowVer: first.RowVer, ActorUserId: OUTSIDER,
  });
  ok(saved.Content === "<p>Shared text</p>", "anyone edits a shared page");
  const added = await one("usp_NoteTab_Create", { NoteId: shared.NoteId, Title: "Second", ActorUserId: VIEWER });
  ok(added.NoteTabId > 0 && added.ProjectId === null, "anyone adds a shared page");

  // Deleting in the shared space needs Manager, which only an Admin holds there.
  await expectCode(50003, "a project Manager cannot delete a shared page", () =>
    exec("usp_NoteTab_Delete", { NoteTabId: added.NoteTabId, RowVer: added.RowVer, ActorUserId: PM }));
  ws = await workspace(shared.NoteId, PM);
  await expectCode(50003, "a project Manager cannot delete a shared notebook", () =>
    exec("usp_Note_Delete", { NoteId: shared.NoteId, RowVer: ws.RowVer, ActorUserId: PM }));
  await expectCode(50003, "a Viewer cannot delete a shared notebook", () =>
    exec("usp_Note_Delete", { NoteId: shared.NoteId, RowVer: ws.RowVer, ActorUserId: VIEWER }));

  // A project notebook keeps its project's levels.
  await expectCode(50003, "a project Viewer cannot create in the project", () =>
    notebook(P, `${stamp} viewer`, VIEWER));
  const inP = await notebook(P, `${stamp} project`, PM);
  ok(inP.ProjectId === P, "a project notebook belongs to its project");
  await expectCode(50003, "a non-member cannot open a project notebook", () =>
    workspace(inP.NoteId, OUTSIDER));

  // The cross-project list: the actor's projects plus the shared space, each row with its project.
  let rows = await list(VIEWER, { Search: stamp });
  const sharedRow = rows.find((r) => r.NoteId === shared.NoteId);
  const projectRow = rows.find((r) => r.NoteId === inP.NoteId);
  ok(sharedRow && sharedRow.ProjectName === null && sharedRow.ActorAccess === "Contributor",
    "the shared notebook is listed without a project, writable by everyone");
  ok(projectRow && projectRow.ProjectName === `${stamp}-p` && projectRow.ActorAccess === "Viewer",
    "a project notebook is listed with its project and the actor's level there");
  rows = await list(OUTSIDER, { Search: stamp });
  ok(rows.some((r) => r.NoteId === shared.NoteId), "a user on no project sees the shared space");
  ok(!rows.some((r) => r.NoteId === inP.NoteId), "and no notebook of a project they are not on");
  rows = await list(PM, { Search: stamp, WithoutProject: 1 });
  ok(rows.length >= 1 && rows.every((r) => r.ProjectId === null), "No project lists only the shared space");
  rows = await list(PM, { Search: stamp, ProjectId: P });
  ok(rows.length === 1 && rows[0].NoteId === inP.NoteId, "a project filter lists only that project");

  // An Admin deletes in the shared space; the notebook takes its pages with it.
  const page = pagesOf(await workspace(shared.NoteId, ADMIN)).find((t) => t.NoteTabId === added.NoteTabId);
  await exec("usp_NoteTab_Delete", { NoteTabId: added.NoteTabId, RowVer: page.RowVer, ActorUserId: ADMIN });
  ws = await workspace(shared.NoteId, ADMIN);
  ok(pagesOf(ws).length === 1, "an Admin deletes a shared page");
  await exec("usp_Note_Delete", { NoteId: shared.NoteId, RowVer: ws.RowVer, ActorUserId: ADMIN });
  await expectCode(50001, "an Admin deletes the shared notebook", () => workspace(shared.NoteId, VIEWER));
  rows = await list(VIEWER, { Search: stamp });
  ok(!rows.some((r) => r.NoteId === shared.NoteId), "a deleted notebook leaves the list");

  // Tabs (ADR-0053): the first tab takes every page, a later tab starts with one new page.
  const sectionsOf = (w) => JSON.parse(w.SectionsJson || "[]");
  const tabbed = await notebook(P, `${stamp} tabs`, PM);
  await one("usp_NoteTab_Create", { NoteId: tabbed.NoteId, Title: "Page 2", ActorUserId: PM });
  await expectCode(50003, "a project Viewer cannot add a tab", () =>
    exec("usp_NoteSection_Create", { NoteId: tabbed.NoteId, Title: "A", PageTitle: "Page 1", ActorUserId: VIEWER }));
  await expectCode(50004, "a tab needs a title", () =>
    exec("usp_NoteSection_Create", { NoteId: tabbed.NoteId, Title: " ", PageTitle: "Page 1", ActorUserId: PM }));
  const tabA = await one("usp_NoteSection_Create", {
    NoteId: tabbed.NoteId, Title: "A", PageTitle: "Page 1", ActorUserId: PM,
  });
  ws = await workspace(tabbed.NoteId, PM);
  ok(pagesOf(ws).length === 2 && pagesOf(ws).every((t) => t.NoteSectionId === tabA.NoteSectionId),
    "the first tab takes every page");
  ok(tabA.FirstPageId === pagesOf(ws)[0].NoteTabId, "and opens on the first of them");
  const tabB = await one("usp_NoteSection_Create", {
    NoteId: tabbed.NoteId, Title: "B", PageTitle: "B page", ActorUserId: PM,
  });
  ws = await workspace(tabbed.NoteId, PM);
  const bPages = pagesOf(ws).filter((t) => t.NoteSectionId === tabB.NoteSectionId);
  ok(bPages.length === 1 && bPages[0].NoteTabId === tabB.FirstPageId && bPages[0].Title === "B page",
    "a later tab starts with one new page");
  ok(sectionsOf(ws).map((s) => s.Title).join() === "A,B", "tabs read in the order they were added");

  // Every page sits in a tab once a notebook has tabs, and only in a tab of its own notebook.
  await expectCode(50004, "a page of a tabbed notebook needs a tab", () =>
    exec("usp_NoteTab_Create", { NoteId: tabbed.NoteId, Title: "Loose", ActorUserId: PM }));
  await expectCode(50004, "a page cannot join a tab of another notebook", () =>
    exec("usp_NoteTab_Create", { NoteId: inP.NoteId, Title: "Stray", NoteSectionId: tabA.NoteSectionId, ActorUserId: PM }));
  const inA = await one("usp_NoteTab_Create", {
    NoteId: tabbed.NoteId, Title: "Page 3", NoteSectionId: tabA.NoteSectionId, ActorUserId: PM,
  });
  ok(inA.NoteSectionId === tabA.NoteSectionId, "a page is added to the tab it names");

  // Moving: to the end of another tab; never out of the tab's last page or into the same tab.
  await exec("usp_NoteTab_Move", {
    NoteTabId: inA.NoteTabId, NoteSectionId: tabB.NoteSectionId, RowVer: inA.RowVer, ActorUserId: PM,
  });
  ws = await workspace(tabbed.NoteId, PM);
  let inB = pagesOf(ws).filter((t) => t.NoteSectionId === tabB.NoteSectionId);
  ok(inB.map((t) => t.NoteTabId).join() === `${tabB.FirstPageId},${inA.NoteTabId}`,
    "a moved page lands at the end of its new tab");
  const moved = inB[1];
  await expectCode(50002, "a stale move conflicts", () =>
    exec("usp_NoteTab_Move", { NoteTabId: moved.NoteTabId, NoteSectionId: tabA.NoteSectionId, RowVer: inA.RowVer, ActorUserId: PM }));
  await expectCode(50004, "a page cannot move to the tab it is in", () =>
    exec("usp_NoteTab_Move", { NoteTabId: moved.NoteTabId, NoteSectionId: tabB.NoteSectionId, RowVer: moved.RowVer, ActorUserId: PM }));
  await expectCode(50003, "a project Viewer cannot move a page", () =>
    exec("usp_NoteTab_Move", { NoteTabId: moved.NoteTabId, NoteSectionId: tabA.NoteSectionId, RowVer: moved.RowVer, ActorUserId: VIEWER }));
  const lonelyTab = await one("usp_NoteSection_Create", {
    NoteId: tabbed.NoteId, Title: "C", PageTitle: "C page", ActorUserId: PM,
  });
  ws = await workspace(tabbed.NoteId, PM);
  const cPage = pagesOf(ws).find((t) => t.NoteTabId === lonelyTab.FirstPageId);
  await expectCode(50004, "the last page of a tab cannot move out", () =>
    exec("usp_NoteTab_Move", { NoteTabId: cPage.NoteTabId, NoteSectionId: tabA.NoteSectionId, RowVer: cPage.RowVer, ActorUserId: PM }));
  await expectCode(50004, "the last page of a tab cannot be deleted", () =>
    exec("usp_NoteTab_Delete", { NoteTabId: cPage.NoteTabId, RowVer: cPage.RowVer, ActorUserId: PM }));

  // Renaming and reordering tabs keep the RowVer check.
  const cRow = sectionsOf(ws).find((s) => s.NoteSectionId === lonelyTab.NoteSectionId);
  const renamedTab = await one("usp_NoteSection_Update", {
    NoteSectionId: cRow.NoteSectionId, Title: "Renamed", RowVer: cRow.RowVer, ActorUserId: PM,
  });
  ok(renamedTab.Title === "Renamed", "a tab is renamed");
  await expectCode(50002, "a stale rename conflicts", () =>
    exec("usp_NoteSection_Update", { NoteSectionId: cRow.NoteSectionId, Title: "Again", RowVer: cRow.RowVer, ActorUserId: PM }));
  ws = await workspace(tabbed.NoteId, PM);
  const order = (ids) => {
    const byId = new Map(sectionsOf(ws).map((s) => [s.NoteSectionId, s]));
    return JSON.stringify(ids.map((id) => ({ id, rowVer: byId.get(id).RowVer })));
  };
  await expectCode(50002, "a reorder that leaves a tab out conflicts", () =>
    exec("usp_NoteSection_Reorder", {
      NoteId: tabbed.NoteId, OrderJson: order([tabB.NoteSectionId, tabA.NoteSectionId]), ActorUserId: PM,
    }));
  await exec("usp_NoteSection_Reorder", {
    NoteId: tabbed.NoteId,
    OrderJson: order([lonelyTab.NoteSectionId, tabB.NoteSectionId, tabA.NoteSectionId]),
    ActorUserId: PM,
  });
  ws = await workspace(tabbed.NoteId, PM);
  ok(sectionsOf(ws).map((s) => s.Title).join() === "Renamed,B,A", "tabs are reordered");

  // Deleting a tab takes its pages; the last tab stays.
  const cNow = sectionsOf(ws).find((s) => s.NoteSectionId === lonelyTab.NoteSectionId);
  await expectCode(50003, "a project Viewer cannot delete a tab", () =>
    exec("usp_NoteSection_Delete", { NoteSectionId: cNow.NoteSectionId, RowVer: cNow.RowVer, ActorUserId: VIEWER }));
  await exec("usp_NoteSection_Delete", { NoteSectionId: cNow.NoteSectionId, RowVer: cNow.RowVer, ActorUserId: PM });
  ws = await workspace(tabbed.NoteId, PM);
  ok(sectionsOf(ws).length === 2 && !pagesOf(ws).some((t) => t.NoteTabId === cPage.NoteTabId),
    "deleting a tab deletes its pages");

  // Remove tabs keeps every page, in the order the tabs showed them.
  const shown = sectionsOf(ws).flatMap((s) =>
    pagesOf(ws).filter((t) => t.NoteSectionId === s.NoteSectionId).map((t) => t.NoteTabId));
  await expectCode(50003, "a project Viewer cannot remove the tabs", () =>
    exec("usp_NoteSection_Ungroup", {
      NoteId: tabbed.NoteId, OrderJson: order(sectionsOf(ws).map((s) => s.NoteSectionId)), ActorUserId: VIEWER,
    }));
  await exec("usp_NoteSection_Ungroup", {
    NoteId: tabbed.NoteId, OrderJson: order(sectionsOf(ws).map((s) => s.NoteSectionId)), ActorUserId: PM,
  });
  ws = await workspace(tabbed.NoteId, PM);
  ok(sectionsOf(ws).length === 0 && pagesOf(ws).every((t) => t.NoteSectionId === null),
    "removing the tabs keeps the pages without a tab");
  ok(pagesOf(ws).map((t) => t.NoteTabId).join() === shown.join(), "in the order the tabs showed them");

  // The last tab: a notebook with tabs keeps one.
  const only = await one("usp_NoteSection_Create", {
    NoteId: tabbed.NoteId, Title: "Only", PageTitle: "Page 1", ActorUserId: PM,
  });
  await expectCode(50004, "a notebook keeps at least one tab", () =>
    exec("usp_NoteSection_Delete", { NoteSectionId: only.NoteSectionId, RowVer: only.RowVer, ActorUserId: PM }));
  ws = await workspace(tabbed.NoteId, PM);
  await exec("usp_Note_Delete", { NoteId: tabbed.NoteId, RowVer: ws.RowVer, ActorUserId: PM });
  await expectCode(50001, "a tabbed notebook is deleted with its tabs", () => workspace(tabbed.NoteId, PM));

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
