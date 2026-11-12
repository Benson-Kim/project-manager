// Behaviour checks for the stakeholder matrix (migration 066): power, interest and stance through
// create, update, get and list; the narrow place proc (values, stale version, access, audit); the
// whole-project matrix read; and places being per project. Runs against the seeded database in the
// CI db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer) and
// locally: node db/tests/stakeholder-matrix-procs.cjs. Creates throwaway projects and leaves rows
// behind, so never point it at a real database.
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (DB_NAME must be set; .env fills the rest).
require("./support/test-env.cjs");
const sql = require("mssql");

const ADMIN = 1;
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
const create = async (projectId, first, last, extra = {}) =>
  (await exec("usp_Stakeholder_Create", {
    ProjectId: projectId, FirstName: first, LastName: last, ActorUserId: PM, ...extra,
  }))[0][0];
const get = async (id, actor = PM) =>
  (await exec("usp_Stakeholder_GetById", { StakeholderId: id, ActorUserId: actor }))[0][0];
const update = async (row, fields, actor = PM) =>
  (await exec("usp_Stakeholder_Update", {
    StakeholderId: row.StakeholderId, ProjectId: row.ProjectId, FirstName: row.FirstName,
    LastName: row.LastName, RowVer: row.RowVer, ActorUserId: actor, ...fields,
  }))[0][0];
const place = async (id, power, interest, rowVer, actor = PM) =>
  (await exec("usp_Stakeholder_Place", {
    StakeholderId: id, Power: power, Interest: interest, RowVer: rowVer, ActorUserId: actor,
  }))[0][0];
const matrix = async (projectId, actor = PM) =>
  (await exec("usp_Stakeholder_Matrix", { ProjectId: projectId, ActorUserId: actor }))[0];

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 300000,
  });
  const stamp = Date.now();
  const P = await project(`matrix-${stamp}`);
  const Q = await project(`matrix-q-${stamp}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });

  // Create, get, update and list carry the three fields.
  const a = await create(P, "Ada", "Zulu", { Power: 70, Interest: 20, Stance: "Supporter" });
  ok(a.Power === 70 && a.Interest === 20 && a.Stance === "Supporter", "create returns power, interest and stance");
  const b = await create(P, "Ben", "Alpha");
  ok(b.Power === null && b.Interest === null && b.Stance === null, "a stakeholder starts unplaced");
  await expectCode(50004, "create refuses power 101", () => create(P, "X", "X", { Power: 101 }));
  await expectCode(50004, "create refuses interest -1", () => create(P, "X", "X", { Interest: -1 }));
  await expectCode(50004, "create refuses an unknown stance", () => create(P, "X", "X", { Stance: "Ally" }));
  for (const edge of [0, 100]) {
    const e = await create(P, "Edge", `E${edge}`, { Power: edge, Interest: edge });
    ok(e.Power === edge && e.Interest === edge, `create keeps ${edge} at the edge`);
  }
  const got = await get(a.StakeholderId);
  ok(got.Power === 70 && got.Interest === 20 && got.Stance === "Supporter", "get returns the three fields");
  const u = await update(got, { Power: 40, Interest: 80, Stance: "Critic" });
  ok(u.Power === 40 && u.Interest === 80 && u.Stance === "Critic", "update writes the three fields");
  await expectCode(50004, "update refuses power 101", () => update(u, { Power: 101, Interest: 80, Stance: "Critic" }));
  await expectCode(50004, "update refuses an unknown stance", () => update(u, { Power: 40, Interest: 80, Stance: "critic" }));
  const listed = (await exec("usp_Stakeholder_List", { ProjectId: P, ActorUserId: PM, PageSize: 100 }))[0];
  const la = listed.find((r) => r.StakeholderId === a.StakeholderId);
  ok(la?.Power === 40 && la?.Interest === 80 && la?.Stance === "Critic", "list returns the three fields");

  // Place.
  const moved = await place(a.StakeholderId, 85, 35, u.RowVer);
  ok(moved.Power === 85 && moved.Interest === 35, "place moves the stakeholder");
  ok(String(moved.RowVer) !== String(u.RowVer), "place returns a new RowVer");
  const after = await get(a.StakeholderId);
  ok(after.Stance === "Critic" && after.FirstName === "Ada", "place leaves the rest of the row alone");
  await expectCode(50002, "place refuses a stale RowVer", () => place(a.StakeholderId, 10, 10, u.RowVer));
  await expectCode(50004, "place refuses power 101", () => place(a.StakeholderId, 101, 10, moved.RowVer));
  await expectCode(50004, "place refuses interest -5", () => place(a.StakeholderId, 10, -5, moved.RowVer));
  await expectCode(50004, "place refuses a missing interest", () => place(a.StakeholderId, 10, null, moved.RowVer));
  await expectCode(50003, "a Viewer cannot place", () => place(a.StakeholderId, 10, 10, moved.RowVer, VIEWER));
  await expectCode(50003, "a Contributor cannot place", () => place(a.StakeholderId, 10, 10, moved.RowVer, CONTRIB));
  await expectCode(50001, "place on a missing stakeholder is not found", () => place(-1, 10, 10, 1));
  const unmoved = await get(a.StakeholderId);
  ok(unmoved.Power === 85 && unmoved.Interest === 35, "refused places change nothing");
  const audit = (await exec("usp_Audit_List", { ActorUserId: ADMIN, Search: "app.Stakeholder", PageSize: 100 }))[0]
    .filter((r) => String(r.EntityId) === String(a.StakeholderId));
  ok(audit.length === 3, `create, update and place each write one audit row (got ${audit.length})`);

  // The matrix read.
  const q1 = await create(Q, "Ada", "Zulu", { Power: 10, Interest: 90, Stance: "Champion" });
  const rows = await matrix(P);
  ok(rows.every((r) => r.StakeholderId !== q1.StakeholderId), "the matrix holds only its own project's rows");
  ok(rows.length === 4, `the matrix lists every active row, placed or not (got ${rows.length})`);
  ok(rows[0].StakeholderId === b.StakeholderId, "the matrix is ordered by last name");
  const ra = rows.find((r) => r.StakeholderId === a.StakeholderId);
  ok(ra.Power === 85 && ra.Interest === 35 && ra.Stance === "Critic" && ra.RowVer !== undefined,
    "a matrix row carries its place, stance and RowVer");
  ok((await matrix(P, VIEWER)).length === 4, "a Viewer reads the matrix");
  await expectCode(50003, "an outsider cannot read another project's matrix", () => matrix(Q, CONTRIB));
  await expectCode(50004, "the matrix needs a project", () => matrix(null));

  // Places are per project: the same person in two projects is two rows with two places.
  const qAfter = await get(q1.StakeholderId);
  ok(qAfter.Power === 10 && qAfter.Interest === 90 && qAfter.Stance === "Champion",
    "a place in one project leaves the same person's place in another alone");
  const qMoved = await place(q1.StakeholderId, 60, 60, q1.RowVer);
  ok(qMoved.Power === 60 && (await get(a.StakeholderId)).Power === 85, "moving them in the other project leaves this one");

  await pool.close();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
