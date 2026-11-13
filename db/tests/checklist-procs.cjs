// Behaviour checks for the checklist procs (ADR-0066): checklists, the columns people add, rows,
// cells of every kind, the sign-off and to-do buttons; the access level each needs; versions on
// every write; the kind rules on a cell; the column and name limits. Runs against the seeded
// database in the CI db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm, 4 e2e-contributor,
// 5 e2e-viewer) and locally: node db/tests/checklist-procs.cjs. Creates throwaway projects and
// leaves soft-deleted rows behind, so never point it at a real database.
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (DB_NAME must be set; .env fills the rest).
require("./support/test-env.cjs");
const sql = require("mssql");
const { openAuditTrail } = require("./support/audit-trail.cjs");

const PM = 3;
const CONTRIB = 4;
const VIEWER = 5;
let pool;
let failures = 0;
let passes = 0;

async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  return (await req.execute(proc)).recordsets;
}
const one = async (proc, params) => (await exec(proc, params))[0]?.[0];
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
    ProjectName: name, A1: 0, DA: 0, DAS: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
async function team(projectId) {
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: projectId,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });
}
const checklist = (projectId, name, actor = PM) =>
  one("usp_Checklist_Create", { ProjectId: projectId, Name: name, ActorUserId: actor });
const column = (checklistId, name, kind, actionKind = null, actor = PM) =>
  one("usp_ChecklistColumn_Create", {
    ChecklistId: checklistId, Name: name, Kind: kind, ActionKind: actionKind, ActorUserId: actor,
  });
const columns = async (checklistId, actor = PM) =>
  (await exec("usp_ChecklistColumn_List", { ChecklistId: checklistId, ActorUserId: actor }))[0];
const item = (checklistId, title, actor = PM) =>
  one("usp_ChecklistItem_Create", { ChecklistId: checklistId, Title: title, ActorUserId: actor });
const items = async (checklistId, extra = {}, actor = PM) =>
  (await exec("usp_ChecklistItem_List", { ChecklistId: checklistId, ActorUserId: actor, ...extra }))[0];
const setCell = (row, col, value, actor = PM) =>
  one("usp_ChecklistCell_Set", {
    ChecklistItemId: row.ChecklistItemId, ChecklistColumnId: col.ChecklistColumnId,
    Value: value, RowVer: row.RowVer, ActorUserId: actor,
  });
const cells = (row) => JSON.parse(row.Cells ?? "[]");
const cellOf = (row, col) => cells(row).find((c) => c.columnId === col.ChecklistColumnId);
let trail;
const audits = async (entity, id) => (await trail.of(entity, id)).map((r) => r.Action);

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 300000,
  });
  trail = await openAuditTrail(exec);
  const stamp = Date.now();
  const P = await project(`checklist-${stamp}`);
  const Q = await project(`checklist-q-${stamp}`);
  await team(P);

  // Checklists: create, names, list, rename.
  const a = await checklist(P, "  Go-live  ", CONTRIB);
  ok(a.Name === "Go-live", `a contributor creates a checklist, name trimmed, got "${a.Name}"`);
  await expectCode(50005, "a second checklist with the same name", () => checklist(P, "Go-live"));
  ok((await checklist(Q, "Go-live")).Name === "Go-live", "another project may reuse the name");
  await expectCode(50003, "a viewer cannot create a checklist", () => checklist(P, "Mine", VIEWER));
  await expectCode(50004, "a blank checklist name", () => checklist(P, "   "));
  const listed = (await exec("usp_Checklist_List", { ProjectId: P, ActorUserId: VIEWER }))[0];
  ok(listed.length === 1 && listed[0].ChecklistId === a.ChecklistId, "a viewer lists the project's checklists");
  await expectCode(50003, "a member of another project cannot list them", () =>
    exec("usp_Checklist_List", { ProjectId: Q, ActorUserId: CONTRIB }));
  const renamed = await one("usp_Checklist_Rename", {
    ChecklistId: a.ChecklistId, Name: "Go-live list", RowVer: a.RowVer, ActorUserId: CONTRIB,
  });
  ok(renamed.Name === "Go-live list", "a contributor renames");
  await expectCode(50002, "a rename under a stale version", () =>
    exec("usp_Checklist_Rename", { ChecklistId: a.ChecklistId, Name: "x", RowVer: a.RowVer, ActorUserId: PM }));

  // Columns: every kind, the action rule, names, order, the 30 cap.
  const due = await column(a.ChecklistId, "Due", "date", null, CONTRIB);
  const note = await column(a.ChecklistId, "Note", "text");
  const doc = await column(a.ChecklistId, "Spec", "document");
  const sign = await column(a.ChecklistId, "Sign off", "action", "signoff");
  const todo = await column(a.ChecklistId, "Follow up", "action", "todo");
  ok([due, note, doc, sign, todo].every(Boolean), "a column of each kind is added");
  await expectCode(50004, "an action column without its action", () => column(a.ChecklistId, "Btn", "action"));
  await expectCode(50004, "an action on a text column", () => column(a.ChecklistId, "T2", "text", "signoff"));
  await expectCode(50004, "an unknown kind", () => column(a.ChecklistId, "Num", "number"));
  await expectCode(50005, "a second column with the same name", () => column(a.ChecklistId, "Note", "text"));
  await expectCode(50003, "a viewer cannot add a column", () => column(a.ChecklistId, "V", "text", null, VIEWER));
  let order = (await columns(a.ChecklistId)).map((c) => c.Name);
  ok(order.join() === "Due,Note,Spec,Sign off,Follow up", `columns keep their order, got ${order}`);
  const moved = (await exec("usp_ChecklistColumn_Move", {
    ChecklistColumnId: note.ChecklistColumnId, Direction: -1, RowVer: note.RowVer, ActorUserId: CONTRIB,
  }))[0];
  ok(moved.map((c) => c.Name).join() === "Note,Due,Spec,Sign off,Follow up", "a column moves one place left");
  const first = moved[0];
  const atEdge = (await exec("usp_ChecklistColumn_Move", {
    ChecklistColumnId: first.ChecklistColumnId, Direction: -1, RowVer: first.RowVer, ActorUserId: PM,
  }))[0];
  ok(atEdge.map((c) => c.Name).join() === "Note,Due,Spec,Sign off,Follow up", "the first column cannot move further left");
  await expectCode(50002, "a move under a stale version", () =>
    exec("usp_ChecklistColumn_Move", { ChecklistColumnId: note.ChecklistColumnId, Direction: 1, RowVer: note.RowVer, ActorUserId: PM }));
  const roomy = await checklist(P, `Caps ${stamp}`);
  for (let i = 1; i <= 30; i++) await column(roomy.ChecklistId, `C${i}`, "text");
  await expectCode(50004, "a 31st column", () => column(roomy.ChecklistId, "C31", "text"));

  // Rows and the done tick.
  const r1 = await item(a.ChecklistId, "Sign the contract", CONTRIB);
  const r2 = await item(a.ChecklistId, "Book the venue");
  ok(r1.Title === "Sign the contract" && r1.IsDone === false, "a contributor adds a row");
  await expectCode(50003, "a viewer cannot add a row", () => item(a.ChecklistId, "x", VIEWER));
  await expectCode(50004, "a blank row title", () => item(a.ChecklistId, " "));
  const ticked = await one("usp_ChecklistItem_SetStatus", {
    ChecklistItemId: r2.ChecklistItemId, IsDone: true, RowVer: r2.RowVer, ActorUserId: CONTRIB,
  });
  ok(ticked.IsDone === true && ticked.DoneAtUtc && ticked.DoneByName, "a tick keeps who and when");
  const unticked = await one("usp_ChecklistItem_SetStatus", {
    ChecklistItemId: r2.ChecklistItemId, IsDone: false, RowVer: ticked.RowVer, ActorUserId: PM,
  });
  ok(unticked.IsDone === false && unticked.DoneAtUtc === null, "an untick clears them");
  await expectCode(50002, "a tick under a stale version", () =>
    exec("usp_ChecklistItem_SetStatus", { ChecklistItemId: r2.ChecklistItemId, IsDone: true, RowVer: r2.RowVer, ActorUserId: PM }));

  // Cells: each kind's rule, versions, emptying.
  let row = await setCell(r1, due, "2026-12-01", CONTRIB);
  ok(cellOf(row, due)?.date === "2026-12-01", "a date cell is set");
  await expectCode(50002, "a cell under a stale row version", () => setCell(r1, note, "late"));
  await expectCode(50004, "a bad date", () => setCell(row, due, "2026-13-45"));
  await expectCode(50004, "a date in another format", () => setCell(row, due, "01/12/2026"));
  row = await setCell(row, note, "Ask legal first");
  ok(cellOf(row, note)?.text === "Ask legal first", "a text cell is set");
  await expectCode(50004, "text over 2,000 characters", () => setCell(row, note, "x".repeat(2001)));
  await expectCode(50004, "a javascript: link", () => setCell(row, doc, "javascript:alert(1)"));
  await expectCode(50004, "a link with a space", () => setCell(row, doc, "https://a b.example"));
  await expectCode(50004, "a link without a scheme", () => setCell(row, doc, "example.com/spec"));
  row = await setCell(row, doc, "https://example.com/spec?v=2");
  ok(cellOf(row, doc)?.link === "https://example.com/spec?v=2", "a web link is set");
  await expectCode(50004, "a sign-off with another value", () => setCell(row, sign, "yes"));
  await expectCode(50004, "a to-do cell cannot be typed in", () => setCell(row, todo, "1"));
  row = await setCell(row, sign, "1", CONTRIB);
  ok(cellOf(row, sign)?.signedAt && cellOf(row, sign)?.signedBy, "a sign-off keeps who and when");
  row = await setCell(row, sign, null);
  ok(!cellOf(row, sign), "a sign-off clears");
  row = await setCell(row, note, "   ");
  ok(!cellOf(row, note), "a blank value empties the cell");
  await expectCode(50003, "a viewer cannot fill a cell", () => setCell(row, note, "v", VIEWER));
  const other = await checklist(P, `Other ${stamp}`);
  const otherCol = await column(other.ChecklistId, "Elsewhere", "text");
  await expectCode(50001, "a column of another checklist", () => setCell(row, otherCol, "x"));
  ok((await audits("app.ChecklistCell", `${r1.ChecklistItemId}:${due.ChecklistColumnId}`)).includes("Update"), "a cell write is audited");

  // The to-do button: one live to-do per cell, due on the row's first date.
  row = await one("usp_Todo_BuildFromChecklist", {
    ChecklistItemId: r1.ChecklistItemId, ChecklistColumnId: todo.ChecklistColumnId, ActorUserId: CONTRIB,
  });
  const todoId = cellOf(row, todo)?.todoId;
  ok(Number.isInteger(todoId), "the button makes a to-do");
  const todoRow = (await exec("usp_TodoItem_GetById", { TodoItemId: todoId, ActorUserId: CONTRIB }))[0][0];
  const made = { ProjectId: todoRow.ProjectId, TodoItem: todoRow.TodoItem, Due: todoRow.DueDate?.toISOString().slice(0, 10) };
  ok(made.ProjectId === P && made.TodoItem === "Sign the contract" && made.Due === "2026-12-01",
    `the to-do takes the row's project, title and first date, got ${JSON.stringify(made)}`);
  const again = await one("usp_Todo_BuildFromChecklist", {
    ChecklistItemId: r1.ChecklistItemId, ChecklistColumnId: todo.ChecklistColumnId, ActorUserId: PM,
  });
  ok(cellOf(again, todo)?.todoId === todoId, "a second press finds the first to-do");
  await expectCode(50004, "a sign-off column makes no to-do", () =>
    exec("usp_Todo_BuildFromChecklist", { ChecklistItemId: r1.ChecklistItemId, ChecklistColumnId: sign.ChecklistColumnId, ActorUserId: PM }));
  await expectCode(50003, "a viewer cannot make a to-do", () =>
    exec("usp_Todo_BuildFromChecklist", { ChecklistItemId: r1.ChecklistItemId, ChecklistColumnId: todo.ChecklistColumnId, ActorUserId: VIEWER }));

  // The list: paging, search, cells, levels.
  const page1 = await items(a.ChecklistId, { Page: 1, PageSize: 1 }, VIEWER);
  ok(page1.length === 1 && page1[0].TotalCount === 2 && page1[0].ActorAccess === "Viewer", "a viewer reads one page with the total and its level");
  ok(page1[0].ChecklistItemId === r1.ChecklistItemId && cells(page1[0]).length === 3, "rows come in their order, with their cells");
  const found = await items(a.ChecklistId, { Search: "venue" });
  ok(found.length === 1 && found[0].ChecklistItemId === r2.ChecklistItemId, "search finds by title");
  const wild = await items(a.ChecklistId, { Search: "%" });
  ok(wild.length === 0, "a % in the search is a literal");

  // Deletes: Manager only; a column's values go with it.
  const cols = await columns(a.ChecklistId);
  const dueNow = cols.find((c) => c.ChecklistColumnId === due.ChecklistColumnId);
  await expectCode(50003, "a contributor cannot delete a column", () =>
    exec("usp_ChecklistColumn_Delete", { ChecklistColumnId: due.ChecklistColumnId, RowVer: dueNow.RowVer, ActorUserId: CONTRIB }));
  await exec("usp_ChecklistColumn_Delete", { ChecklistColumnId: due.ChecklistColumnId, RowVer: dueNow.RowVer, ActorUserId: PM });
  const afterDelete = (await items(a.ChecklistId))[0];
  ok(!cellOf(afterDelete, due), "a deleted column's values leave the list");
  const deleted = (await trail.of("app.ChecklistColumn", due.ChecklistColumnId, { withJson: true })).pop();
  const kept = deleted?.Action === "Delete" ? JSON.parse(deleted.AfterJson).valuesHidden : null;
  ok(kept === 1, `a deleted column's values stay recoverable in the table, got ${kept}`);
  ok((await columns(a.ChecklistId)).every((c) => c.ChecklistColumnId !== due.ChecklistColumnId), "a deleted column leaves the list");
  ok((await column(a.ChecklistId, "Due", "date")).Name === "Due", "its name can be used again");
  await expectCode(50003, "a contributor cannot delete a row", () =>
    exec("usp_ChecklistItem_Delete", { ChecklistItemId: r2.ChecklistItemId, RowVer: unticked.RowVer, ActorUserId: CONTRIB }));
  await exec("usp_ChecklistItem_Delete", { ChecklistItemId: r2.ChecklistItemId, RowVer: unticked.RowVer, ActorUserId: PM });
  ok((await items(a.ChecklistId)).length === 1, "a deleted row leaves the list");
  const current = (await exec("usp_Checklist_List", { ProjectId: P, ActorUserId: PM }))[0]
    .find((c) => c.ChecklistId === a.ChecklistId);
  await expectCode(50003, "a contributor cannot delete a checklist", () =>
    exec("usp_Checklist_Delete", { ChecklistId: a.ChecklistId, RowVer: current.RowVer, ActorUserId: CONTRIB }));
  await exec("usp_Checklist_Delete", { ChecklistId: a.ChecklistId, RowVer: current.RowVer, ActorUserId: PM });
  await expectCode(50001, "a deleted checklist's rows cannot be read", () => items(a.ChecklistId));
  const kinds = await audits("app.Checklist", a.ChecklistId);
  ok(kinds[0] === "Create" && kinds.includes("Update") && kinds[kinds.length - 1] === "Delete", `checklist changes are audited, got ${kinds}`);

  // Two people on one row at once: exactly one lands.
  const b = await checklist(P, `Race ${stamp}`);
  const bCol = await column(b.ChecklistId, "Note", "text");
  const bRow = await item(b.ChecklistId, "Race row");
  const results = await Promise.allSettled([setCell(bRow, bCol, "one"), setCell(bRow, bCol, "two", CONTRIB)]);
  ok(results.filter((r) => r.status === "fulfilled").length === 1, "two cell writes on one version: one lands");
  ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.number === 50002), "the other gets a conflict");

  await pool.close();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
