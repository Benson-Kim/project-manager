// Behaviour checks for the BPMN diagram procs (ADR-0064): create, list, read, rename, save and
// delete; the access level each needs; a project's diagrams kept from members of other projects;
// versions on every write; and the JSON checks and size cap on a saved drawing. Runs against the
// seeded database in the CI db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm, 4 e2e-contributor,
// 5 e2e-viewer) and locally: node db/tests/bpmn-diagram-procs.cjs. Creates throwaway projects and
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
  for (const [k, v] of Object.entries(params)) {
    if (k === "DiagramJson") req.input(k, sql.NVarChar(sql.MAX), v);
    else req.input(k, v);
  }
  return (await req.execute(proc)).recordsets;
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
  const [[row]] = await exec("usp_Project_Create", {
    ProjectName: name, A1: 0, DA: 0, DAS: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
const create = async (projectId, name, actor = PM) =>
  (await exec("usp_BpmnDiagram_Create", { ProjectId: projectId, Name: name, ActorUserId: actor }))[0][0];
const list = async (projectId, actor = PM) =>
  (await exec("usp_BpmnDiagram_List", { ProjectId: projectId, ActorUserId: actor }))[0];
const get = async (id, actor = PM) =>
  (await exec("usp_BpmnDiagram_GetById", { BpmnDiagramId: id, ActorUserId: actor }))[0][0];
const rename = async (id, name, rowVer, actor = PM) =>
  (await exec("usp_BpmnDiagram_Rename", { BpmnDiagramId: id, Name: name, RowVer: rowVer, ActorUserId: actor }))[0][0];
const save = async (id, json, rowVer, actor = PM) =>
  (await exec("usp_BpmnDiagram_Update", { BpmnDiagramId: id, DiagramJson: json, RowVer: rowVer, ActorUserId: actor }))[0][0];
const remove = async (id, rowVer, actor = PM) =>
  (await exec("usp_BpmnDiagram_Delete", { BpmnDiagramId: id, RowVer: rowVer, ActorUserId: actor }))[0][0];
let trail;
const audits = (id) => trail.of("app.BpmnDiagram", id, { withJson: true });

const drawing = (label) => JSON.stringify({
  version: 1,
  pools: [{ id: "pool_a", name: "Shop", x: 0, y: 0, width: 700, lanes: [
    { id: "lane_a", name: "Sales", height: 160 }, { id: "lane_b", name: "Stores", height: 160 }] }],
  shapes: [
    { id: "s1", kind: "startEvent", x: 40, y: 60, width: 40, height: 40, label: "" },
    { id: "s2", kind: "task", x: 200, y: 200, width: 120, height: 80, label },
  ],
  flows: [{ id: "f1", kind: "sequence", source: "s1", target: "s2", sourceSide: "right", targetSide: "left", label: "go" }],
});

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
  const P = await project(`bpmn-${stamp}`);
  const Q = await project(`bpmn-q-${stamp}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });

  // Create and read.
  const a = await create(P, "  Order to cash  ");
  ok(a.Name === "Order to cash", `a name is trimmed, got "${a.Name}"`);
  ok(typeof a.RowVer === "string" || typeof a.RowVer === "number", "create answers with a version");
  const opened = await get(a.BpmnDiagramId);
  ok(opened.ProjectId === P, "the diagram reads back with its project");
  ok(JSON.parse(opened.DiagramJson).version === 1, "a new diagram is an empty version 1 document");
  ok(JSON.parse(opened.DiagramJson).shapes.length === 0, "a new diagram has no shapes");
  await expectCode(50005, "a second diagram with the same name", () => create(P, "order to cash"));
  await expectCode(50004, "a blank name", () => create(P, "   "));
  await expectCode(50004, "a name over 120 characters", () => create(P, "x".repeat(121)));
  const b = await create(P, "Hiring", CONTRIB);
  ok((await list(P, VIEWER)).map((r) => r.Name).join() === "Hiring,Order to cash", "the list is by name and a viewer reads it");
  ok((await list(P)).every((r) => !("DiagramJson" in r)), "the list leaves the drawings out");

  // Access levels.
  await expectCode(50003, "a viewer cannot create", () => create(P, "Viewer's", VIEWER));
  ok((await get(a.BpmnDiagramId, VIEWER)).BpmnDiagramId === a.BpmnDiagramId, "a viewer opens a diagram");
  await expectCode(50003, "a viewer cannot save", () => save(a.BpmnDiagramId, drawing("x"), opened.RowVer, VIEWER));
  await expectCode(50003, "a viewer cannot rename", () => rename(a.BpmnDiagramId, "V", opened.RowVer, VIEWER));
  await expectCode(50003, "a contributor cannot delete", () => remove(b.BpmnDiagramId, b.RowVer, CONTRIB));

  // Another project's members see nothing here (object-level access on the row's own project).
  await expectCode(50003, "a non-member cannot list", () => list(Q, CONTRIB));
  const q = await create(Q, "Private");
  await expectCode(50003, "a non-member cannot open by id", () => get(q.BpmnDiagramId, CONTRIB));
  await expectCode(50003, "a non-member cannot save by id", () => save(q.BpmnDiagramId, drawing("x"), q.RowVer, CONTRIB));
  await expectCode(50003, "a non-member cannot rename by id", () => rename(q.BpmnDiagramId, "Mine", q.RowVer, CONTRIB));
  await expectCode(50003, "a non-member cannot delete by id", () => remove(q.BpmnDiagramId, q.RowVer, CONTRIB));
  ok((await get(q.BpmnDiagramId)).Name === "Private", "the other project's diagram is untouched");
  await expectCode(50001, "a missing id", () => get(2147483000));

  // Saving the drawing.
  const saved = await save(a.BpmnDiagramId, drawing("Check stock"), opened.RowVer, CONTRIB);
  ok(saved.ProjectId === P && saved.RowVer !== opened.RowVer, "a save answers with the project and a new version");
  const reread = JSON.parse((await get(a.BpmnDiagramId)).DiagramJson);
  ok(reread.shapes[1].label === "Check stock" && reread.flows[0].label === "go", "the drawing reads back whole");
  ok(reread.pools[0].lanes.length === 2, "the lanes read back");
  await expectCode(50002, "a save under a stale version", () => save(a.BpmnDiagramId, drawing("late"), opened.RowVer));
  await expectCode(50004, "a save that is not JSON", () => save(a.BpmnDiagramId, "not json", saved.RowVer));
  await expectCode(50004, "a save of another document version", () =>
    save(a.BpmnDiagramId, JSON.stringify({ version: 2, pools: [], shapes: [], flows: [] }), saved.RowVer));
  await expectCode(50004, "a save without its lists", () => save(a.BpmnDiagramId, '{"version":1}', saved.RowVer));
  const huge = JSON.stringify({ version: 1, pools: [], shapes: [], flows: [], pad: "x".repeat(300000) });
  await expectCode(50004, "a save over 300,000 characters", () => save(a.BpmnDiagramId, huge, saved.RowVer));
  ok(JSON.parse((await get(a.BpmnDiagramId)).DiagramJson).shapes.length === 2, "a refused save changes nothing");
  const rows = await audits(a.BpmnDiagramId);
  const saveRow = rows.find((r) => r.AfterJson && r.AfterJson.includes('"shapes":2'));
  ok(!!saveRow, "a save is audited with its element counts");
  ok(rows.every((r) => !(r.AfterJson || "").includes("Check stock")), "the audit log does not copy the drawing");

  // Rename.
  const renamed = await rename(a.BpmnDiagramId, "Order to cash v2", saved.RowVer, CONTRIB);
  ok(renamed.Name === "Order to cash v2" && renamed.ProjectId === P, "a contributor renames");
  await expectCode(50002, "a rename under a stale version", () => rename(a.BpmnDiagramId, "Again", saved.RowVer));
  await expectCode(50005, "a rename onto another diagram's name", () => rename(a.BpmnDiagramId, "Hiring", renamed.RowVer));
  ok((await rename(a.BpmnDiagramId, "Order to cash v2", renamed.RowVer)).Name === "Order to cash v2", "keeping its own name is no clash");

  // Delete.
  const current = await get(a.BpmnDiagramId);
  await expectCode(50002, "a delete under a stale version", () => remove(a.BpmnDiagramId, saved.RowVer));
  const gone = await remove(a.BpmnDiagramId, current.RowVer);
  ok(gone.ProjectId === P, "a manager deletes");
  await expectCode(50001, "a deleted diagram cannot be opened", () => get(a.BpmnDiagramId));
  await expectCode(50001, "a deleted diagram cannot be saved", () => save(a.BpmnDiagramId, drawing("x"), current.RowVer));
  ok(!(await list(P)).some((r) => r.BpmnDiagramId === a.BpmnDiagramId), "a deleted diagram leaves the list");
  ok((await create(P, "Order to cash v2")).Name === "Order to cash v2", "a deleted diagram's name can be used again");
  const kinds = (await audits(a.BpmnDiagramId)).map((r) => r.Action);
  ok(kinds[0] === "Create" && kinds.includes("Update") && kinds[kinds.length - 1] === "Delete", `create, saves, renames and delete are audited, got ${kinds}`);

  // Two editors saving at once: exactly one wins.
  const race = await create(P, `Race ${stamp}`);
  const results = await Promise.allSettled([
    save(race.BpmnDiagramId, drawing("one"), race.RowVer),
    save(race.BpmnDiagramId, drawing("two"), race.RowVer, CONTRIB),
  ]);
  ok(results.filter((r) => r.status === "fulfilled").length === 1, "two saves on one version: one lands");
  ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.number === 50002), "the other gets a conflict");

  await pool.close();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
