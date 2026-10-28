// Behaviour checks for the requirement register and traceability procs (ADR-0037): roles and
// per-person overrides, object-level access across projects, the trace and allocation rules
// (need vs solution, same project, no self-link), per-project reference numbers that are never
// reused, the shared met tick across deliverables, a deliverable delete that keeps the
// requirements, a requirement delete that removes its links and allocations, and a create whose
// links fail after the insert leaving nothing behind. Runs against the seeded database in the CI
// db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer) and locally:
// node db/tests/requirements-procs.cjs. Creates throwaway projects and leaves soft-deleted rows
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
    ProjectName: name, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0, Requisition: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
async function deliverable(projectId, name, actor = PM) {
  const [[row]] = await exec("usp_KeyDeliverable_Create", {
    ProjectId: projectId, KeyRequirement: name, StartDate: new Date("2026-01-05"),
    Deadline: new Date("2026-01-12"), ActorUserId: actor,
  });
  return row;
}
async function create(params) {
  const [[row]] = await exec("usp_Requirement_Create", params);
  return row;
}
const links = (row, col) => JSON.parse(row[col] || "[]");
async function gantt(projectId, actor = PM) {
  const [rows] = await exec("usp_KeyDeliverable_GanttData", {
    ProjectId: projectId, ActorUserId: actor, WithProjectRow: 1,
  });
  return rows;
}
function reqsOf(rows, kdId) {
  const row = rows.find((r) => r.KeyDeliverableId === kdId);
  return JSON.parse((row && row.RequirementsJson) || "[]");
}

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const stamp = Date.now();
  const P = await project(`req-${stamp}`);
  const Q = await project(`req-q-${stamp}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });
  const D1 = await deliverable(P, "D1");
  const D2 = await deliverable(P, "D2");
  const DQ = await deliverable(Q, "DQ");

  // Roles: a Viewer cannot create; a Contributor can (requirements:create defaults to Contributor).
  await expectCode(50003, "viewer cannot create", () =>
    create({ ProjectId: P, RequirementType: "BR", Requirement: "v", ActorUserId: VIEWER }));
  const br1 = await create({ ProjectId: P, RequirementType: "BR", Requirement: "Reduce cost", ActorUserId: CONTRIB });
  const br2 = await create({ ProjectId: P, RequirementType: "BR", Requirement: "Faster intake", ActorUserId: PM });
  const sr1 = await create({ ProjectId: P, RequirementType: "SR", Requirement: "Clerk sign-off", ActorUserId: PM });
  ok(br1.Number === 1 && br2.Number === 2 && sr1.Number === 1, "numbers run per project and type");

  // A business requirement never carries a met tick, whatever the caller sends.
  const brMet = await create({ ProjectId: P, RequirementType: "BR", Requirement: "No tick", IsMet: true, ActorUserId: PM });
  ok(brMet.IsMet === false, "a need is stored unticked");

  // A solution that validates two needs and is allocated to one deliverable.
  const fr1 = await create({
    ProjectId: P, RequirementType: "FR", Requirement: "Online form",
    ValidatesIds: JSON.stringify([br1.RequirementId, br2.RequirementId]),
    KeyDeliverableIds: JSON.stringify([D1.KeyDeliverableId]), ActorUserId: PM,
  });
  ok(links(fr1, "ValidatesJson").length === 2, "solution validates two needs");
  ok(links(fr1, "DeliverablesJson").length === 1, "solution allocated to one deliverable");

  // Trace and allocation rules.
  await expectCode(50004, "a need cannot validate", () =>
    create({ ProjectId: P, RequirementType: "BR", Requirement: "bad",
             ValidatesIds: JSON.stringify([sr1.RequirementId]), ActorUserId: PM }));
  await expectCode(50004, "a solution validates only needs", () =>
    create({ ProjectId: P, RequirementType: "NFR", Requirement: "bad",
             ValidatesIds: JSON.stringify([fr1.RequirementId]), ActorUserId: PM }));
  await expectCode(50004, "cross-project link is not found", () =>
    create({ ProjectId: P, RequirementType: "FR", Requirement: "bad",
             ValidatesIds: JSON.stringify([999999999]), ActorUserId: PM }));
  await expectCode(50004, "a need cannot be allocated", () =>
    create({ ProjectId: P, RequirementType: "BR", Requirement: "bad",
             KeyDeliverableIds: JSON.stringify([D1.KeyDeliverableId]), ActorUserId: PM }));
  await expectCode(50004, "cross-project allocation is not found", () =>
    create({ ProjectId: P, RequirementType: "FR", Requirement: "bad",
             KeyDeliverableIds: JSON.stringify([DQ.KeyDeliverableId]), ActorUserId: PM }));
  // Object-level access: a requirement in Q, read by P's Viewer (not assigned to Q), is refused.
  const reqQ = await create({ ProjectId: Q, RequirementType: "BR", Requirement: "Q only", ActorUserId: PM });
  await expectCode(50003, "a P viewer cannot read a Q requirement (IDOR)", () =>
    exec("usp_Requirement_GetById", { RequirementId: reqQ.RequirementId, ActorUserId: VIEWER }));

  // Fault injection: a create whose allocation fails after the insert leaves no requirement.
  const beforeFault = (await exec("usp_Requirement_List", { ActorUserId: PM, ProjectId: P, PageSize: 100 }))[0];
  await expectCode(50004, "create with a bad deliverable rolls back", () =>
    create({ ProjectId: P, RequirementType: "FR", Requirement: "ghost",
             KeyDeliverableIds: JSON.stringify([DQ.KeyDeliverableId]), ActorUserId: PM }));
  const afterFault = (await exec("usp_Requirement_List", { ActorUserId: PM, ProjectId: P, PageSize: 100 }))[0];
  ok(afterFault.length === beforeFault.length && !afterFault.some((r) => r.Requirement === "ghost"),
    "a rolled-back create leaves no requirement behind");

  // The shared met tick shows under every deliverable the requirement is on.
  await exec("usp_Requirement_Update", {
    RequirementId: fr1.RequirementId, RequirementType: "FR", Requirement: "Online form", IsMet: 1,
    DeliverablesSet: 1, KeyDeliverableIds: JSON.stringify([D1.KeyDeliverableId, D2.KeyDeliverableId]),
    RowVer: fr1.RowVer, ActorUserId: PM,
  });
  let g = await gantt(P);
  const onD1 = reqsOf(g, D1.KeyDeliverableId).find((r) => r.id === fr1.RequirementId);
  const onD2 = reqsOf(g, D2.KeyDeliverableId).find((r) => r.id === fr1.RequirementId);
  ok(onD1 && onD2 && onD1.isMet === true && onD2.isMet === true, "one tick shows under both deliverables");
  ok(onD1.type === "FR" && onD1.ref === fr1.Ref,
    `the cascade carries the type and reference (got ${onD1.ref}, register ${fr1.Ref})`);

  // An incompatible type change is refused on the resulting state.
  const fr1now = (await exec("usp_Requirement_GetById", { RequirementId: fr1.RequirementId, ActorUserId: PM }))[0][0];
  await expectCode(50004, "cannot turn a linked, allocated solution into a need", () =>
    exec("usp_Requirement_Update", {
      RequirementId: fr1.RequirementId, RequirementType: "BR", Requirement: "Online form", IsMet: 0,
      RowVer: fr1now.RowVer, ActorUserId: PM,
    }));
  // A stale RowVer conflicts.
  await expectCode(50002, "stale rowver conflicts", () =>
    exec("usp_Requirement_Update", {
      RequirementId: fr1.RequirementId, RequirementType: "FR", Requirement: "x", IsMet: 0,
      RowVer: fr1.RowVer, ActorUserId: PM,
    }));

  // A Contributor cannot delete; a Manager can.
  await expectCode(50003, "contributor cannot delete", () =>
    exec("usp_Requirement_Delete", { RequirementId: br1.RequirementId, RowVer: br1.RowVer, ActorUserId: CONTRIB }));

  // Deleting a deliverable keeps the requirements; it only loses that allocation.
  await exec("usp_KeyDeliverable_Delete", { KeyDeliverableId: D1.KeyDeliverableId, RowVer: D1.RowVer, ActorUserId: PM });
  const stillThere = (await exec("usp_Requirement_GetById", { RequirementId: fr1.RequirementId, ActorUserId: PM }))[0][0];
  ok(stillThere && links(stillThere, "DeliverablesJson").length === 1, "a deliverable delete keeps the requirement, drops its allocation");
  g = await gantt(P);
  ok(reqsOf(g, D2.KeyDeliverableId).some((r) => r.id === fr1.RequirementId), "it still shows under the other deliverable");

  // Deleting a requirement removes its links both ways and its allocations; its number is not reused.
  const fresh = (await exec("usp_Requirement_GetById", { RequirementId: fr1.RequirementId, ActorUserId: PM }))[0][0];
  await exec("usp_Requirement_Delete", { RequirementId: fr1.RequirementId, RowVer: fresh.RowVer, ActorUserId: PM });
  const br1after = (await exec("usp_Requirement_GetById", { RequirementId: br1.RequirementId, ActorUserId: PM }))[0][0];
  ok(links(br1after, "ValidatedByJson").length === 0, "the deleted solution no longer validates its needs");
  g = await gantt(P);
  ok(!reqsOf(g, D2.KeyDeliverableId).some((r) => r.id === fr1.RequirementId), "it is gone from the cascade");
  const fr2 = await create({ ProjectId: P, RequirementType: "FR", Requirement: "Second form", ActorUserId: PM });
  ok(fr2.Number === 2, "a reference number is never reused after a delete");

  // ---- Sub-requirements (ADR-0048, migration 048) ----
  // The tree only exists in SQL: the path is a recursive walk, the numbering is per parent, and the
  // depth, the type inheritance and both refusals are taken under the project lock. None of it can
  // be reached from Vitest, so this is the only place it actually runs.
  const getReq = async (id, actor = PM) =>
    (await exec("usp_Requirement_GetById", { RequirementId: id, ActorUserId: actor }))[0][0];

  const root = await create({ ProjectId: P, RequirementType: "FR", Requirement: "Intake", ActorUserId: PM });
  ok(root.Ref === `FR-${root.Number}` && root.Depth === 0 && root.ChildCount === 0,
    "a root requirement's reference is its own number");

  // A child is numbered under its parent, from 1, whatever numbers the type already has.
  const kid1 = await create({ ProjectId: P, Requirement: "Validate card", ParentRequirementId: root.RequirementId, ActorUserId: PM });
  const kid2 = await create({ ProjectId: P, Requirement: "Validate address", ParentRequirementId: root.RequirementId, ActorUserId: PM });
  ok(kid1.Number === 1 && kid2.Number === 2, "sub-requirements are numbered under their parent, from 1");
  ok(kid1.Ref === `FR-${root.Number}.1` && kid2.Ref === `FR-${root.Number}.2`,
    `the reference is the whole path (got ${kid1.Ref}, ${kid2.Ref})`);
  ok(kid1.Depth === 1 && kid2.Depth === 1, "a child is one level down");

  // The type is the parent's, not the caller's: passing a different one changes nothing.
  const kid3 = await create({ ProjectId: P, RequirementType: "BR", Requirement: "Ignore my type", ParentRequirementId: root.RequirementId, ActorUserId: PM });
  ok(kid3.RequirementType === "FR", `a child inherits its parent's type (got ${kid3.RequirementType})`);

  const grand = await create({ ProjectId: P, Requirement: "Luhn check", ParentRequirementId: kid1.RequirementId, ActorUserId: PM });
  ok(grand.Ref === `FR-${root.Number}.1.1` && grand.Depth === 2,
    `a grandchild carries both levels (got ${grand.Ref})`);

  // Four levels, then no more — the client said it does not go long, so the limit is the proc's.
  const great = await create({ ProjectId: P, Requirement: "Mod 10", ParentRequirementId: grand.RequirementId, ActorUserId: PM });
  ok(great.Depth === 3, "the fourth level is allowed");
  await expectCode(50004, "a fifth level is refused", () =>
    create({ ProjectId: P, Requirement: "too deep", ParentRequirementId: great.RequirementId, ActorUserId: PM }));

  // A parent cannot point outside its project, and a missing one is not found.
  await expectCode(50001, "a parent in another project is not found", () =>
    create({ ProjectId: Q, Requirement: "cross", ParentRequirementId: root.RequirementId, ActorUserId: PM }));
  await expectCode(50001, "a parent that does not exist is not found", () =>
    create({ ProjectId: P, Requirement: "orphan", ParentRequirementId: 2000000000, ActorUserId: PM }));

  // The two refusals the client still has to choose between. Both are reversible; neither guesses.
  const rootNow = await getReq(root.RequirementId);
  ok(rootNow.ChildCount === 3, `a parent counts its live children (got ${rootNow.ChildCount})`);
  await expectCode(50004, "a parent with children cannot be deleted", () =>
    exec("usp_Requirement_Delete", { RequirementId: root.RequirementId, RowVer: rootNow.RowVer, ActorUserId: PM }));
  await expectCode(50004, "a parent with children cannot change type", () =>
    exec("usp_Requirement_Update", { RequirementId: root.RequirementId, RequirementType: "TR",
      Requirement: rootNow.Requirement, IsMet: 0, RowVer: rootNow.RowVer, ActorUserId: PM }));
  const kidNow = await getReq(kid3.RequirementId);
  await expectCode(50004, "a child cannot change its own type", () =>
    exec("usp_Requirement_Update", { RequirementId: kid3.RequirementId, RequirementType: "TR",
      Requirement: kidNow.Requirement, IsMet: 0, RowVer: kidNow.RowVer, ActorUserId: PM }));

  // A leaf child deletes normally, and that frees its parent again.
  await exec("usp_Requirement_Delete", { RequirementId: kid3.RequirementId, RowVer: kidNow.RowVer, ActorUserId: PM });
  ok((await getReq(root.RequirementId)).ChildCount === 2, "deleting a child lowers the parent's count");

  // The register's order is the path, and '1.2' comes before '1.10' — which it would not as text.
  const wide = await create({ ProjectId: P, RequirementType: "NFR", Requirement: "Limits", ActorUserId: PM });
  for (let i = 0; i < 10; i++) {
    await create({ ProjectId: P, Requirement: `limit ${i + 1}`, ParentRequirementId: wide.RequirementId, ActorUserId: PM });
  }
  const [listed] = await exec("usp_Requirement_List", { ProjectId: P, ActorUserId: PM, Type: "NFR", PageSize: 100 });
  const widePath = listed.filter((r) => r.Ref.startsWith(`NFR-${wide.Number}.`)).map((r) => r.Ref);
  ok(widePath[0] === `NFR-${wide.Number}.1` && widePath[1] === `NFR-${wide.Number}.2`
     && widePath[9] === `NFR-${wide.Number}.10`,
    `the padded path orders 1.2 before 1.10 (got ${widePath.slice(0, 3).join(", ")} ... ${widePath[9]})`);
  ok(listed.findIndex((r) => r.Ref === `NFR-${wide.Number}`) <
     listed.findIndex((r) => r.Ref === `NFR-${wide.Number}.1`),
    "a parent is listed before its children");
  ok(listed.every((r) => typeof r.Depth === "number" && r.SortPath),
    "every listed row carries its depth and sort path");

  // A sub-requirement is a need like any other, so the trace picker offers it.
  const needRoot = await create({ ProjectId: P, RequirementType: "SR", Requirement: "Sign-off", ActorUserId: PM });
  const needKid = await create({ ProjectId: P, Requirement: "Clerk sign-off", ParentRequirementId: needRoot.RequirementId, ActorUserId: PM });
  const [opts] = await exec("usp_Requirement_ListOptions", { ProjectId: P, ActorUserId: PM });
  const offered = opts.find((o) => o.RequirementId === needKid.RequirementId);
  ok(offered && offered.Ref === `SR-${needRoot.Number}.1`,
    "the trace picker offers a sub-requirement, by its path");

  // A solution that traces to it must show that path in its chips, not the parent's.
  const tracer = await create({ ProjectId: P, RequirementType: "FR", Requirement: "Sign-off screen",
    ValidatesIds: JSON.stringify([needKid.RequirementId]), ActorUserId: PM });
  ok(links(tracer, "ValidatesJson").some((l) => l.ref === `SR-${needRoot.Number}.1`),
    "a trace chip carries the sub-requirement's own path");

  // The WBS and the Gantt are a second surface rendering the same reference (LESSONS §38).
  const subAlloc = await create({ ProjectId: P, Requirement: "Card screen", ParentRequirementId: root.RequirementId,
    KeyDeliverableIds: JSON.stringify([D2.KeyDeliverableId]), ActorUserId: PM });
  const gSub = reqsOf(await gantt(P), D2.KeyDeliverableId).find((r) => r.id === subAlloc.RequirementId);
  ok(gSub && gSub.ref === subAlloc.Ref,
    `the Gantt names an allocated sub-requirement as the register does (got ${gSub && gSub.ref}, register ${subAlloc.Ref})`);

  // Nothing above moved an existing root's number, which is what makes 048 safe on a live register.
  ok((await getReq(br1.RequirementId)).Ref === `BR-${br1.Number}`,
    "a requirement that existed before the tree keeps its reference");

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
