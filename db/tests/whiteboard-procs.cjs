// Behaviour checks for the whiteboard procs (migration 086): create, list, read, rename, save and
// delete; the access level each needs; a project's whiteboards kept from members of other projects;
// versions on every write; the JSON checks and size cap on a saved scene; and names or scene text
// shaped like SQL stored as plain text. Runs against the seeded database in the CI db-apply job
// (E2E_SEED=1: users 1 admin, 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer) and locally:
// node db/tests/whiteboard-procs.cjs. Creates throwaway projects and leaves soft-deleted rows
// behind, so never point it at a real database.
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (DB_NAME must be set; .env fills the rest).
require("./support/test-env.cjs");
const sql = require("mssql");
const { openAuditTrail } = require("./support/audit-trail.cjs");

const PM = 3;
const CONTRIB = 4;
const VIEWER = 5;
const CAP = 800000;
let pool;
let failures = 0;
let passes = 0;

async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) {
    if (k === "BoardJson") req.input(k, sql.NVarChar(sql.MAX), v);
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
  (await exec("usp_Whiteboard_Create", { ProjectId: projectId, Name: name, ActorUserId: actor }))[0][0];
const list = async (projectId, actor = PM) =>
  (await exec("usp_Whiteboard_List", { ProjectId: projectId, ActorUserId: actor }))[0];
const get = async (id, actor = PM) =>
  (await exec("usp_Whiteboard_GetById", { WhiteboardId: id, ActorUserId: actor }))[0][0];
const rename = async (id, name, rowVer, actor = PM) =>
  (await exec("usp_Whiteboard_Rename", { WhiteboardId: id, Name: name, RowVer: rowVer, ActorUserId: actor }))[0][0];
const save = async (id, json, rowVer, actor = PM) =>
  (await exec("usp_Whiteboard_Update", { WhiteboardId: id, BoardJson: json, RowVer: rowVer, ActorUserId: actor }))[0][0];
const remove = async (id, rowVer, actor = PM) =>
  (await exec("usp_Whiteboard_Delete", { WhiteboardId: id, RowVer: rowVer, ActorUserId: actor }))[0][0];
const tableExists = async () =>
  (await pool.request().query("SELECT OBJECT_ID(N'app.Whiteboard', N'U') AS Id")).recordset[0].Id !== null;
let trail;
const audits = (id) => trail.of("app.Whiteboard", id, { withJson: true });

const scene = (label) => JSON.stringify({
  version: 1,
  elements: [
    { id: "r1", type: "rectangle", x: 40, y: 60, width: 160, height: 80, angle: 0, strokeColor: "#1e1e1e" },
    { id: "t1", type: "text", x: 60, y: 90, width: 120, height: 25, angle: 0, text: label, originalText: label },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
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
  const P = await project(`whiteboard-${stamp}`);
  const Q = await project(`whiteboard-q-${stamp}`);
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
  const a = await create(P, "  Kick-off  ");
  ok(a.Name === "Kick-off", `a name is trimmed, got "${a.Name}"`);
  ok(typeof a.RowVer === "string" || typeof a.RowVer === "number", "create answers with a version");
  const opened = await get(a.WhiteboardId);
  ok(opened.ProjectId === P, "the whiteboard reads back with its project");
  const fresh = JSON.parse(opened.BoardJson);
  ok(fresh.version === 1 && fresh.elements.length === 0, "a new whiteboard is an empty version 1 scene");
  ok(fresh.appState.viewBackgroundColor === "#ffffff", "a new whiteboard has a white background");
  await expectCode(50005, "a second whiteboard with the same name", () => create(P, "kick-off"));
  await expectCode(50004, "a blank name", () => create(P, "   "));
  await expectCode(50004, "a name over 120 characters", () => create(P, "x".repeat(121)));
  const b = await create(P, "Brainstorm", CONTRIB);
  ok((await list(P, VIEWER)).map((r) => r.Name).join() === "Brainstorm,Kick-off", "the list is by name and a viewer reads it");
  ok((await list(P)).every((r) => !("BoardJson" in r)), "the list leaves the scenes out");

  // Access levels.
  await expectCode(50003, "a viewer cannot create", () => create(P, "Viewer's", VIEWER));
  ok((await get(a.WhiteboardId, VIEWER)).WhiteboardId === a.WhiteboardId, "a viewer opens a whiteboard");
  await expectCode(50003, "a viewer cannot save", () => save(a.WhiteboardId, scene("x"), opened.RowVer, VIEWER));
  await expectCode(50003, "a viewer cannot rename", () => rename(a.WhiteboardId, "V", opened.RowVer, VIEWER));
  await expectCode(50003, "a contributor cannot delete", () => remove(b.WhiteboardId, b.RowVer, CONTRIB));

  // Another project's members see nothing here (object-level access on the row's own project).
  await expectCode(50003, "a non-member cannot list", () => list(Q, CONTRIB));
  const q = await create(Q, "Private");
  await expectCode(50003, "a non-member cannot open by id", () => get(q.WhiteboardId, CONTRIB));
  await expectCode(50003, "a non-member cannot save by id", () => save(q.WhiteboardId, scene("x"), q.RowVer, CONTRIB));
  await expectCode(50003, "a non-member cannot rename by id", () => rename(q.WhiteboardId, "Mine", q.RowVer, CONTRIB));
  await expectCode(50003, "a non-member cannot delete by id", () => remove(q.WhiteboardId, q.RowVer, CONTRIB));
  ok((await get(q.WhiteboardId)).Name === "Private", "the other project's whiteboard is untouched");
  await expectCode(50001, "a missing id", () => get(2147483000));

  // Saving the scene.
  const saved = await save(a.WhiteboardId, scene("Agenda"), opened.RowVer, CONTRIB);
  ok(saved.ProjectId === P && saved.RowVer !== opened.RowVer, "a save answers with the project and a new version");
  const reread = JSON.parse((await get(a.WhiteboardId)).BoardJson);
  ok(reread.elements[1].text === "Agenda" && reread.elements[0].type === "rectangle", "the scene reads back whole");
  await expectCode(50002, "a save under a stale version", () => save(a.WhiteboardId, scene("late"), opened.RowVer));
  await expectCode(50004, "a save that is not JSON", () => save(a.WhiteboardId, "not json", saved.RowVer));
  await expectCode(50004, "a save of another scene version", () =>
    save(a.WhiteboardId, JSON.stringify({ version: 2, elements: [] }), saved.RowVer));
  await expectCode(50004, "a save without its elements", () => save(a.WhiteboardId, '{"version":1}', saved.RowVer));
  await expectCode(50004, "a save whose elements are not a list", () =>
    save(a.WhiteboardId, '{"version":1,"elements":{}}', saved.RowVer));
  await expectCode(50004, "a save whose elements are text", () =>
    save(a.WhiteboardId, '{"version":1,"elements":"[]"}', saved.RowVer));
  const huge = JSON.stringify({ version: 1, elements: [], pad: "x".repeat(CAP) });
  await expectCode(50004, `a save over ${CAP} characters`, () => save(a.WhiteboardId, huge, saved.RowVer));
  ok(JSON.parse((await get(a.WhiteboardId)).BoardJson).elements.length === 2, "a refused save changes nothing");
  const rows = await audits(a.WhiteboardId);
  const saveRow = rows.find((r) => r.AfterJson && r.AfterJson.includes('"elements":2'));
  ok(!!saveRow, "a save is audited with its element count");
  ok(rows.every((r) => !(r.AfterJson || "").includes("Agenda")), "the audit log does not copy the scene");

  // Names and scene text shaped like SQL are stored as plain text (parameters only, no dynamic SQL).
  const hostileName = "Plan'); DROP TABLE app.Whiteboard;--";
  const h = await create(P, hostileName);
  ok(h.Name === hostileName, "a name with quotes and SQL is stored as typed");
  ok((await list(P)).some((r) => r.Name === hostileName), "the list reads that name back as typed");
  await expectCode(50005, "the same SQL-shaped name again is a duplicate, not a statement", () => create(P, hostileName));
  const hostileText = "x'; DELETE FROM app.Whiteboard; SELECT N'";
  const hs = await save(h.WhiteboardId, scene(hostileText), h.RowVer);
  ok(JSON.parse((await get(h.WhiteboardId)).BoardJson).elements[1].text === hostileText, "scene text with SQL reads back as typed");
  const second = await rename(h.WhiteboardId, "a' OR '1'='1", hs.RowVer);
  ok(second.Name === "a' OR '1'='1", "a rename with quotes is stored as typed");
  ok((await create(P, "100%_done")).Name === "100%_done", "a name with LIKE wildcards is accepted");
  ok((await create(P, "100X-done")).Name === "100X-done", "and does not clash with a name it would match as a pattern");
  ok(await tableExists(), "the whiteboard table is still there");
  ok((await get(b.WhiteboardId)).Name === "Brainstorm", "other whiteboards are untouched");

  // Rename.
  const renamed = await rename(a.WhiteboardId, "Kick-off v2", saved.RowVer, CONTRIB);
  ok(renamed.Name === "Kick-off v2" && renamed.ProjectId === P, "a contributor renames");
  await expectCode(50002, "a rename under a stale version", () => rename(a.WhiteboardId, "Again", saved.RowVer));
  await expectCode(50005, "a rename onto another whiteboard's name", () => rename(a.WhiteboardId, "Brainstorm", renamed.RowVer));
  ok((await rename(a.WhiteboardId, "Kick-off v2", renamed.RowVer)).Name === "Kick-off v2", "keeping its own name is no clash");

  // Delete.
  const current = await get(a.WhiteboardId);
  await expectCode(50002, "a delete under a stale version", () => remove(a.WhiteboardId, saved.RowVer));
  const gone = await remove(a.WhiteboardId, current.RowVer);
  ok(gone.ProjectId === P, "a manager deletes");
  await expectCode(50001, "a deleted whiteboard cannot be opened", () => get(a.WhiteboardId));
  await expectCode(50001, "a deleted whiteboard cannot be saved", () => save(a.WhiteboardId, scene("x"), current.RowVer));
  ok(!(await list(P)).some((r) => r.WhiteboardId === a.WhiteboardId), "a deleted whiteboard leaves the list");
  ok((await create(P, "Kick-off v2")).Name === "Kick-off v2", "a deleted whiteboard's name can be used again");
  const kinds = (await audits(a.WhiteboardId)).map((r) => r.Action);
  ok(kinds[0] === "Create" && kinds.includes("Update") && kinds[kinds.length - 1] === "Delete", `create, saves, renames and delete are audited, got ${kinds}`);

  // Two editors saving at once: exactly one wins.
  const race = await create(P, `Race ${stamp}`);
  const results = await Promise.allSettled([
    save(race.WhiteboardId, scene("one"), race.RowVer),
    save(race.WhiteboardId, scene("two"), race.RowVer, CONTRIB),
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
