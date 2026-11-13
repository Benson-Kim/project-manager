// Behaviour checks for the responsibility-matrix procs (migration 071): one-per-row roles, roles of
// another framework, the assignee role kept in the WBS assignee list and its RowVer bump, decision rows,
// stale writes, access, audit, the 40-column cap under parallel adds and a race for a one-per-row role. Creates throwaway projects, so never point it
// at a real database. Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (.env fills gaps).
if (!process.env.DB_NAME || (process.env.DB_NAME.trim().toLowerCase() === "projectmanager" && !process.env.CI)) {
  console.error("Set DB_NAME to a test database (e.g. ProjectManager_t1028): ProjectManager is the real one.");
  process.exit(1);
}
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
const { openAuditTrail } = require("./support/audit-trail.cjs");

const PM = 3;
const OUTSIDER = 5;
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
async function code(promise) {
  try {
    await promise;
    return 0;
  } catch (e) {
    return e.number;
  }
}
async function project(name) {
  const [[row]] = await exec("usp_Project_Create", {
    ProjectName: name, A1: 0, DA: 0, DAS: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
async function stakeholder(projectId, first) {
  const [[row]] = await exec("usp_Stakeholder_Create", {
    ProjectId: projectId, FirstName: first, LastName: "Rm", ActorUserId: PM,
  });
  return row.StakeholderId;
}
async function deliverable(projectId) {
  const [[row]] = await exec("usp_KeyDeliverable_Create", {
    ProjectId: projectId, KeyRequirement: "Rm item", StartDate: new Date("2026-01-05"),
    Deadline: new Date("2026-01-12"), ActorUserId: PM,
  });
  return row.KeyDeliverableId;
}
async function decision(projectId) {
  const sets = await exec("usp_Decision_Create", { ProjectId: projectId, Title: "Rm decision", ActorUserId: PM });
  return sets.flat().find((r) => r.DecisionId).DecisionId;
}
async function matrix(projectId, framework, rowKind = "WbsItem") {
  const [[row]] = await exec("usp_ResponsibilityMatrix_Create", {
    ProjectId: projectId, Name: `M ${framework} ${rowKind} ${Date.now()}`, FrameworkCode: framework,
    RowKind: rowKind, ActorUserId: PM,
  });
  return { id: row.ResponsibilityMatrixId, rowVer: row.RowVer, projectId };
}
async function addMember(m, stakeholderId, actor = PM) {
  const [[row]] = await exec("usp_ResponsibilityMember_Add", {
    ProjectId: m.projectId, ResponsibilityMatrixId: m.id, StakeholderId: stakeholderId, RowVer: m.rowVer,
    ActorUserId: actor,
  });
  m.rowVer = row.RowVer;
}
function set(m, kd, s, role, expected, extra = {}) {
  return exec("usp_ResponsibilityAssignment_Set", {
    ProjectId: m.projectId, ResponsibilityMatrixId: m.id, KeyDeliverableId: kd, StakeholderId: s, RoleCode: role,
    ExpectedRoleCode: expected, ActorUserId: PM, ...extra,
  });
}
const list = (projectId, m) =>
  exec("usp_ResponsibilityAssignment_List", { ProjectId: projectId, ResponsibilityMatrixId: m.id, ActorUserId: PM });
async function cells(projectId, m) {
  const [, rows] = await list(projectId, m);
  return rows;
}
const roleOf = (rows, kd, s) =>
  rows.find((r) => r.KeyDeliverableId === kd && r.StakeholderId === s)?.RoleCode ?? null;
let trail;
const auditCount = () => trail.count("app.Responsibility");
const kdRow = async (k) => (await exec("usp_KeyDeliverable_GetById", { KeyDeliverableId: k, ActorUserId: PM }))[0][0];
const assigneeIds = async (k) => JSON.parse((await kdRow(k)).AssigneesJson || "[]").map((a) => Number(a.id));
async function assign(projectId, k, s) {
  const row = await kdRow(k);
  await exec("usp_KeyDeliverable_Update", {
    KeyDeliverableId: k, ProjectId: projectId, KeyRequirement: "Rm item", StartDate: new Date("2026-01-05"),
    Deadline: new Date("2026-01-12"), AssigneeIds: JSON.stringify([...(await assigneeIds(k)), s]), RowVer: row.RowVer,
    ActorUserId: PM,
  });
}
async function removeDeliverable(k) {
  await exec("usp_KeyDeliverable_Delete", { KeyDeliverableId: k, RowVer: (await kdRow(k)).RowVer, ActorUserId: PM });
}
async function removeStakeholder(s) {
  const [[row]] = await exec("usp_Stakeholder_GetById", { StakeholderId: s, ActorUserId: PM });
  await exec("usp_Stakeholder_Delete", { StakeholderId: s, RowVer: row.RowVer, ActorUserId: PM });
}

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    options: { trustServerCertificate: true, encrypt: true },
    connectionTimeout: 60000, requestTimeout: 60000,
  });
  trail = await openAuditTrail(exec);

  const p = await project(`Rm ${Date.now()}`);
  const [s1, s2, s3] = [await stakeholder(p, "Ann"), await stakeholder(p, "Ben"), await stakeholder(p, "Cy")];
  const kd = await deliverable(p);
  const m = await matrix(p, "RACI");
  await addMember(m, s1);
  await addMember(m, s2);

  ok((await code(addMember({ ...m, rowVer: m.rowVer - 1 }, s3))) === 50002, "stale matrix RowVer is CONFLICT");

  const before = await auditCount();
  await set(m, kd, s1, "ACCOUNTABLE", null);
  ok((await auditCount()) === before + 1, "one audit row per cell write");
  ok((await code(set(m, kd, s2, "ACCOUNTABLE", null))) === 50002, "second A on a row is CONFLICT");
  await set(m, kd, s2, "ACCOUNTABLE", null, { MoveSingle: 1 });
  let rows = await cells(p, m);
  ok(roleOf(rows, kd, s2) === "ACCOUNTABLE" && roleOf(rows, kd, s1) === null, "MoveSingle moves the A");

  ok((await code(set(m, kd, s1, "DRIVER", null))) !== 0, "a role of another framework is refused");
  ok((await code(set(m, kd, s1, "CONSULTED", "INFORMED"))) === 50002, "a stale expected role is CONFLICT");

  const kdVer = async () => (await kdRow(kd)).RowVer;
  const ganttVer = String(await kdVer());
  const [[setRow]] = await set(m, kd, s1, "RESPONSIBLE", null);
  ok(
    String(setRow.KeyDeliverableRowVer) === String(await kdVer()) && String(setRow.KeyDeliverableRowVer) !== ganttVer,
    "setting the assignee role bumps the WBS item's RowVer and returns it",
  );
  ok(
    (await code(exec("usp_KeyDeliverable_Update", {
      KeyDeliverableId: kd, ProjectId: p, KeyRequirement: "Rm item", StartDate: new Date("2026-01-05"),
      Deadline: new Date("2026-01-12"), AssigneeIds: "[]", RowVer: ganttVer, ActorUserId: PM,
    }))) === 50002,
    "a Gantt save with the RowVer from before the matrix edit is CONFLICT",
  );
  ok((await assigneeIds(kd)).includes(s1), "the assignee role lives in the WBS assignee list");
  ok(roleOf(await cells(p, m), kd, s1) === "RESPONSIBLE", "List shows an assignee as the assignee role");
  await set(m, kd, s1, null, "RESPONSIBLE");
  ok(!(await assigneeIds(kd)).includes(s1), "clearing the assignee role removes the WBS assignee");

  ok((await code(set(m, kd, s3, "CONSULTED", null))) !== 0, "a stakeholder outside the matrix is refused");
  ok(
    (await code(exec("usp_ResponsibilityAssignment_Set", {
      ProjectId: p, ResponsibilityMatrixId: m.id, KeyDeliverableId: kd, StakeholderId: s1, RoleCode: "CONSULTED",
      ExpectedRoleCode: null, ActorUserId: OUTSIDER,
    }))) === 50003,
    "a user without access cannot write",
  );
  ok(
    (await code(exec("usp_ResponsibilityAssignment_List", {
      ProjectId: p, ResponsibilityMatrixId: m.id, ActorUserId: OUTSIDER,
    }))) === 50003,
    "a user without access cannot list",
  );

  const other = await project(`Rm other ${Date.now()}`);
  ok(
    (await code(exec("usp_ResponsibilityAssignment_List", {
      ProjectId: other, ResponsibilityMatrixId: m.id, ActorUserId: PM,
    }))) === 50001,
    "a matrix of another project is NOT_FOUND",
  );
  const foreignWrites = [
    ["usp_ResponsibilityMatrix_Rename", { Name: "X", RowVer: m.rowVer }],
    ["usp_ResponsibilityMember_Add", { StakeholderId: s3, RowVer: m.rowVer }],
    ["usp_ResponsibilityMember_Move", { StakeholderId: s1, Position: 1, RowVer: m.rowVer }],
    ["usp_ResponsibilityMember_Remove", { StakeholderId: s1, RowVer: m.rowVer }],
    ["usp_ResponsibilityAssignment_Set", { KeyDeliverableId: kd, StakeholderId: s1, RoleCode: "CONSULTED", ExpectedRoleCode: null }],
    ["usp_ResponsibilityMatrix_Delete", { RowVer: m.rowVer }],
  ];
  for (const [proc, extra] of foreignWrites) {
    const params = { ProjectId: other, ResponsibilityMatrixId: m.id, ActorUserId: PM, ...extra };
    ok((await code(exec(proc, params))) === 50001, `${proc} with another project's id is NOT_FOUND`);
  }
  const otherKd = await deliverable(other);
  ok((await code(set(m, otherKd, s1, "CONSULTED", null))) !== 0, "a row of another project is refused");

  await assign(p, kd, s3);
  const hint = (await cells(p, m)).find((r) => r.KeyDeliverableId === kd && r.StakeholderId === s3);
  ok(hint?.RoleCode === "RESPONSIBLE" && hint.IsMember === false, "an assignee outside the matrix lists with IsMember = 0");

  const gone = await deliverable(p);
  await set(m, gone, s1, "CONSULTED", null);
  await set(m, gone, s2, "RESPONSIBLE", null);
  const onGone = async () => (await cells(p, m)).filter((r) => r.KeyDeliverableId === gone).length;
  const beforeDelete = await onGone();
  await removeDeliverable(gone);
  ok(beforeDelete === 2 && (await onGone()) === 0, "a soft-deleted WBS item drops its cells and its assignee hints");

  for (const [framework, role] of [["DACI", "DRIVER"], ["MOCHA", "OWNER"]]) {
    const fm = await matrix(p, framework);
    const fkd = await deliverable(p);
    const member = await stakeholder(p, `${role} member`);
    const outsider = await stakeholder(p, `${role} outsider`);
    await addMember(fm, member);
    await assign(p, fkd, outsider);
    ok((await code(set(fm, fkd, member, role, null))) === 50002, `${framework} ${role} over a non-member assignee is CONFLICT`);
    await set(fm, fkd, member, role, null, { MoveSingle: 1 });
    const after = await cells(p, fm);
    const outsiderRows = (await assigneeIds(fkd)).filter((id) => id === outsider).length;
    ok(
      roleOf(after, fkd, member) === role && roleOf(after, fkd, outsider) === null && outsiderRows === 0,
      `MoveSingle moves ${framework} ${role} from the non-member assignee to the member`,
    );
  }

  const dm = await matrix(p, "RACI", "Decision");
  const dec = await decision(p);
  for (const s of [s1, s2, s3]) await addMember(dm, s);
  const onDec = (s, role, expected) => set(dm, null, s, role, expected, { DecisionId: dec });
  const [[decRow]] = await onDec(s1, "RESPONSIBLE", null);
  await onDec(s2, "ACCOUNTABLE", null);
  await onDec(s3, "CONSULTED", null);
  await onDec(s3, "INFORMED", "CONSULTED");
  const decCells = (await cells(p, dm)).filter((r) => r.DecisionId === dec);
  const decRole = (s) => decCells.find((r) => r.StakeholderId === s)?.RoleCode ?? null;
  ok(
    decRole(s1) === "RESPONSIBLE" && decRole(s2) === "ACCOUNTABLE" && decRole(s3) === "INFORMED" &&
      decCells.every((r) => r.KeyDeliverableId === null),
    "decision rows accept every role",
  );
  ok(
    decRow.KeyDeliverableRowVer === null &&
      (await cells(p, dm)).filter((r) => r.DecisionId === dec && r.RoleCode === "RESPONSIBLE").length === 1,
    "the assignee role is stored on decision rows",
  );
  ok((await code(onDec(s1, "ACCOUNTABLE", "RESPONSIBLE"))) === 50002, "a second A on a decision row is CONFLICT");
  ok((await code(set(dm, kd, s1, "CONSULTED", null))) !== 0, "a WBS row on a decision matrix is refused");

  const big = await matrix(p, "RASCI");
  for (let i = 0; i < 39; i++) await addMember(big, await stakeholder(p, `S${i}`));
  const [last1, last2] = [await stakeholder(p, "Last1"), await stakeholder(p, "Last2")];
  const adds = await Promise.all([code(addMember(big, last1)), code(addMember(big, last2))]);
  const memberCount = (await list(p, big))[0].length;
  ok(adds.filter((c) => c === 0).length === 1 && memberCount === 40, "parallel adds at 39 columns leave exactly 40");
  ok((await code(addMember(big, s1))) === 50004, "the 41st column is refused");

  const race = await matrix(p, "RACI");
  await addMember(race, s1);
  await addMember(race, s2);
  const results = await Promise.all([code(set(race, kd, s1, "ACCOUNTABLE", null)), code(set(race, kd, s2, "ACCOUNTABLE", null))]);
  ok(results.filter((c) => c === 0).length === 1 && results.includes(50002), "two racing A writes: one wins");
  rows = await cells(p, race);
  ok(rows.filter((r) => r.RoleCode === "ACCOUNTABLE").length === 1, "a race leaves exactly one A");

  const [members] = await list(p, race);
  ok(
    members.map((r) => r.StakeholderId).join() === `${s1},${s2}` && typeof members[0].Name === "string",
    "List returns the members first, in column order",
  );
  const holder = rows.find((r) => r.RoleCode === "ACCOUNTABLE").StakeholderId;
  await removeStakeholder(holder);
  const [liveMembers, liveCells] = await list(p, race);
  ok(
    !liveMembers.some((r) => r.StakeholderId === holder) && !liveCells.some((r) => r.StakeholderId === holder),
    "a soft-deleted stakeholder leaves the members and the cells",
  );

  console.log(`responsibility-matrix-procs: ${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
