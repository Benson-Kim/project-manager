// Behaviour checks for the risks & issues procs (#14, ADR-0050): the project access the five
// procs gained, which is the whole substance of the module. app.RiskIssue and its procs have
// existed since module #3 and none of them checked access at all, so these are the assertions
// that prove the hole is shut — read, update and delete across projects, the level each write
// needs, the Admin bypass, ProjectId immutability on update, the managed-list values, the date
// order rule, rowversion concurrency, and the cross-project list filter.
//
// The static guardrail src/tests/proc-access-levels.test.ts pins what the proc TEXT says
// (@MinLevel vs rbac.ts) and the module's Vitest suites mock execProc, so neither executes the
// authorization. db-apply only proves the procs compile. This file is the part that runs them.
//
// Runs against the seeded database in the CI db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm,
// 4 e2e-contributor, 5 e2e-viewer) and locally: node db/tests/risk-issue-procs.cjs. Creates
// throwaway projects and leaves soft-deleted rows behind, so never point it at a real database.
//
// Not covered here, on purpose: the Update carve-out that lets a record stored with its dates
// inverted stay editable. Only migrated rows have an inverted pair, Create refuses to make one,
// and CI connects as the EXECUTE-only login (pm_web, ADR-0033) with no INSERT right to forge one.
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
const create = (projectId, description, actor, extra = {}) =>
  one("usp_RiskIssue_Create", {
    ProjectId: projectId, Description: description, Category: "Risk", DateIdentified: null,
    Status: "Open", Priority: null, Impact: null, Probability: null, MitigationPlan: null,
    Owner: null, DueDate: null, ActorUserId: actor, ...extra,
  });
const get = (riskIssueId, actor) =>
  one("usp_RiskIssue_GetById", { RiskIssueId: riskIssueId, ActorUserId: actor });
const update = (row, actor, extra = {}) =>
  one("usp_RiskIssue_Update", {
    RiskIssueId: row.RiskIssueId, ProjectId: row.ProjectId, Description: row.Description,
    Category: row.Category, DateIdentified: row.DateIdentified, Status: row.Status,
    Priority: row.Priority, Impact: row.Impact, Probability: row.Probability,
    MitigationPlan: row.MitigationPlan, Owner: row.Owner, DueDate: row.DueDate,
    RowVer: row.RowVer, ActorUserId: actor, ...extra,
  });
const remove = (row, actor) =>
  exec("usp_RiskIssue_Delete", {
    RiskIssueId: row.RiskIssueId, RowVer: row.RowVer, ActorUserId: actor,
  });
async function list(actor, params = {}) {
  const [rows] = await exec("usp_RiskIssue_List", {
    ActorUserId: actor, ProjectId: null, Search: null, SortBy: null, SortDir: "asc",
    Page: 1, PageSize: 100, Category: null, Status: null, ...params,
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
  const stamp = `risk-${Date.now()}`;

  // P1 carries all three levels; P2 has only the PM, so P1's members are outsiders to it.
  const P1 = await project(`${stamp}-p1`);
  const P2 = await project(`${stamp}-p2`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P1,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P2,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
    ]),
    ActorUserId: PM,
  });

  const r1 = await create(P1, `${stamp} in p1`, PM);
  const r2 = await create(P2, `${stamp} in p2`, PM);
  ok(r1.ProjectId === P1 && r1.Category === "Risk", "a record is created in its project");

  // ---- the level each write needs (ADR-0021) -------------------------------------------------
  await expectCode(50003, "a Viewer cannot create", () => create(P1, `${stamp} nope`, VIEWER));
  await expectCode(50003, "a Viewer cannot update", () => update(r1, VIEWER));
  ok((await get(r1.RiskIssueId, VIEWER)).RiskIssueId === r1.RiskIssueId, "a Viewer reads");

  const edited = await update(r1, CONTRIB, { Description: `${stamp} edited` });
  ok(edited.Description === `${stamp} edited`, "a Contributor updates");
  await expectCode(50003, "a Contributor cannot delete — Delete needs Manager", () =>
    remove(edited, CONTRIB));

  // ---- object-level access across projects (the BOLA this module closed) ----------------------
  await expectCode(50003, "a non-member cannot read another project's record", () =>
    get(r2.RiskIssueId, CONTRIB));
  await expectCode(50003, "a non-member cannot update another project's record", () =>
    update(r2, CONTRIB));
  await expectCode(50003, "a non-member cannot delete another project's record", () =>
    remove(r2, CONTRIB));
  await expectCode(50003, "a non-member cannot list another project", () =>
    list(CONTRIB, { ProjectId: P2 }));
  ok((await get(r2.RiskIssueId, ADMIN)).RiskIssueId === r2.RiskIssueId, "an Admin reads any project");
  await expectCode(50001, "an unknown id is not found", () => get(2147483647, PM));

  // ---- ProjectId is immutable: a forged payload cannot move a record between projects ---------
  const moved = await update(edited, PM, { ProjectId: P2 });
  ok(moved.ProjectId === P1, "update ignores @ProjectId — the record stays in its project");
  ok((await get(r1.RiskIssueId, VIEWER)).ProjectId === P1, "and it is still readable where it was");

  // ---- managed list values (ADR-0022) --------------------------------------------------------
  await expectCode(50004, "a Category outside the list refuses", () =>
    create(P1, `${stamp} bad cat`, PM, { Category: "Neither" }));
  await expectCode(50004, "a Status outside the list refuses", () =>
    create(P1, `${stamp} bad status`, PM, { Status: "Nonsense" }));
  await expectCode(50004, "a Priority outside the list refuses", () =>
    create(P1, `${stamp} bad prio`, PM, { Priority: "Urgent" }));
  const listed = await create(P1, `${stamp} issue`, PM, {
    Category: "Issue", Status: "In Progress", Priority: "High", Impact: "Low", Probability: "High",
  });
  ok(listed.Category === "Issue" && listed.Probability === "High", "live options are stored as listed");

  // ---- the date order rule -------------------------------------------------------------------
  await expectCode(50004, "a DueDate before DateIdentified refuses on create", () =>
    create(P1, `${stamp} dates`, PM, {
      DateIdentified: new Date("2026-04-01"), DueDate: new Date("2026-03-01"),
    }));
  const dated = await create(P1, `${stamp} ordered`, PM, {
    DateIdentified: new Date("2026-03-01"), DueDate: new Date("2026-04-01"),
  });
  ok(dated.RiskIssueId > 0, "dates in order are accepted");
  await expectCode(50004, "a DueDate before DateIdentified refuses on update", () =>
    update(dated, PM, { DueDate: new Date("2026-01-01") }));

  // ---- rowversion concurrency (ADR-0016) -----------------------------------------------------
  const fresh = await update(moved, PM, { Description: `${stamp} again` });
  await expectCode(50002, "a stale RowVer conflicts on update", () =>
    update(moved, PM, { Description: `${stamp} stale` }));
  await expectCode(50002, "a stale RowVer conflicts on delete", () => remove(moved, PM));

  // ---- the cross-project list (@ProjectId NULL) -----------------------------------------------
  let rows = await list(CONTRIB, { Search: stamp });
  ok(rows.some((r) => r.RiskIssueId === fresh.RiskIssueId), "the list shows a record of the actor's project");
  ok(!rows.some((r) => r.RiskIssueId === r2.RiskIssueId), "and none of a project they are not on");
  ok(rows.every((r) => r.ActorAccess === "Contributor"), "each row carries the actor's level there");
  rows = await list(PM, { Search: stamp });
  ok(rows.some((r) => r.RiskIssueId === r2.RiskIssueId), "the PM sees both projects");
  rows = await list(PM, { Search: stamp, ProjectId: P1, Category: "Issue" });
  ok(rows.length === 1 && rows[0].RiskIssueId === listed.RiskIssueId, "the Category filter narrows to one");

  // A LIKE metacharacter is searched for literally, not as a wildcard (the ESCAPE chain).
  const meta = await create(P1, `${stamp} 100%_done`, PM);
  rows = await list(PM, { Search: "100%_done", ProjectId: P1 });
  ok(rows.length === 1 && rows[0].RiskIssueId === meta.RiskIssueId, "a % and _ in the search match literally");
  rows = await list(PM, { Search: "100%done", ProjectId: P1 });
  ok(rows.length === 0, "and % does not stand in for the underscore");

  // ---- the Manager deletes, and the record leaves every read ---------------------------------
  await remove(fresh, PM);
  await expectCode(50001, "a deleted record is not found", () => get(fresh.RiskIssueId, PM));
  rows = await list(PM, { Search: stamp, ProjectId: P1 });
  ok(!rows.some((r) => r.RiskIssueId === fresh.RiskIssueId), "and it leaves the list");
  await expectCode(50001, "deleting it twice is not found", () => remove(fresh, PM));

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
