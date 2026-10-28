// Behaviour checks for a deliverable's assignees (migration 015): none, one and many are all
// normal, clearing takes the last one off, a repeated id is not a key violation, and an id that is
// not a live stakeholder of the deliverable's own project is dropped rather than refused — the
// asymmetry with the other write procs is deliberate (it leaks nothing and keeps a repeated save
// idempotent), so it is pinned here instead of being left to chance. Runs against the seeded
// database in the CI db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm) and locally:
// node db/tests/key-deliverable-assignees.cjs. Creates throwaway projects and leaves soft-deleted
// rows behind, so never point it at a real database.
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

const PM = 3;
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
async function project(name) {
  const [[row]] = await exec("usp_Project_Create", {
    ProjectName: name, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0, Requisition: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
async function stakeholder(projectId, first, last) {
  const [[row]] = await exec("usp_Stakeholder_Create", {
    ProjectId: projectId, FirstName: first, LastName: last, ActorUserId: PM,
  });
  return row.StakeholderId;
}
async function deliverable(projectId, name, assigneeIds) {
  const params = {
    ProjectId: projectId, KeyRequirement: name, StartDate: new Date("2026-01-05"),
    Deadline: new Date("2026-01-12"), ActorUserId: PM,
  };
  if (assigneeIds !== undefined) params.AssigneeIds = assigneeIds;
  const [[row]] = await exec("usp_KeyDeliverable_Create", params);
  return row;
}
async function update(row, assigneeIds) {
  const params = {
    KeyDeliverableId: row.KeyDeliverableId, KeyRequirement: row.KeyRequirement,
    StartDate: row.StartDate, Deadline: row.Deadline, RowVer: row.RowVer, ActorUserId: PM,
  };
  if (assigneeIds !== undefined) params.AssigneeIds = assigneeIds;
  const [[next]] = await exec("usp_KeyDeliverable_Update", params);
  return next;
}
/** The ids on a row, from the JSON every proc returns (ids arrive as strings). */
const idsOf = (row) =>
  JSON.parse(row.AssigneesJson || "[]")
    .map((a) => Number(a.id))
    .sort((a, b) => a - b);
const namesOf = (row) => (row.AssigneeNames || "").trim();

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const stamp = Date.now();
  const P = await project(`kda-${stamp}`);
  const Other = await project(`kda-other-${stamp}`);
  const ana = await stakeholder(P, "Ana", "Ouellet");
  const bo = await stakeholder(P, "Bo", "Tremblay");
  const outsider = await stakeholder(Other, "Outsider", "Nobody");

  // None, at create: no parameter at all, and an empty array (the proc's LEN > 2 guard).
  const none = await deliverable(P, `none-${stamp}`);
  ok(idsOf(none).length === 0 && namesOf(none) === "", "a deliverable created without assignees has none");
  const empty = await deliverable(P, `empty-${stamp}`, "[]");
  ok(idsOf(empty).length === 0, "an empty array of assignees is none, not an error");

  // One, then many.
  const one = await deliverable(P, `one-${stamp}`, JSON.stringify([ana]));
  ok(idsOf(one).join() === String(ana), "a deliverable can be created with one assignee");
  ok(namesOf(one) === "Ana Ouellet", "the names column reads the junction table");
  const many = await update(one, JSON.stringify([ana, bo]));
  ok(idsOf(many).join() === [ana, bo].sort((a, b) => a - b).join(), "an update can set many assignees");

  // A repeated id is one row, not a primary-key violation.
  const repeated = await update(many, JSON.stringify([ana, ana]));
  ok(idsOf(repeated).join() === String(ana), "a repeated assignee id lands once");

  // An id from another project is dropped; the valid ones in the same call still land.
  const withOutsider = await update(repeated, JSON.stringify([ana, outsider, bo]));
  ok(
    idsOf(withOutsider).join() === [ana, bo].sort((a, b) => a - b).join(),
    "a stakeholder of another project is dropped, and the call still succeeds",
  );

  // NULL clears the set — the form sends it for an empty picker.
  const cleared = await update(withOutsider, null);
  ok(idsOf(cleared).length === 0 && namesOf(cleared) === "", "assigning nobody clears every assignee");

  // The breakdown the editor reads says the same.
  const [rows] = await exec("usp_KeyDeliverable_GanttData", {
    ProjectId: P, ActorUserId: PM, WithProjectRow: 1,
  });
  const onGantt = rows.find((r) => r.KeyDeliverableId === cleared.KeyDeliverableId);
  ok(onGantt && idsOf(onGantt).length === 0, "GanttData shows the cleared set too");
  const stillTwo = rows.find((r) => r.KeyDeliverableId === none.KeyDeliverableId);
  ok(stillTwo && idsOf(stillTwo).length === 0, "GanttData shows an item that never had one");

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
