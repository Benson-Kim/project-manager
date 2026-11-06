// Behaviour checks for the requirement register and traceability procs (ADR-0037): roles and
// per-person overrides, object-level access across projects, the trace and allocation rules
// (need vs solution vs test case, same project, no self-link), per-project reference numbers that are never
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
    requestTimeout: 300000,
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
  await expectCode(50004, "backwards is refused until a rule allows it", () =>
    create({ ProjectId: P, RequirementType: "BR", Requirement: "bad",
             ValidatesIds: JSON.stringify([sr1.RequirementId]), ActorUserId: PM }));
  await expectCode(50004, "cross-project link is not found", () =>
    create({ ProjectId: P, RequirementType: "FR", Requirement: "bad",
             ValidatesIds: JSON.stringify([999999999]), ActorUserId: PM }));
  await expectCode(50004, "cross-project allocation is not found", () =>
    create({ ProjectId: P, RequirementType: "FR", Requirement: "bad",
             KeyDeliverableIds: JSON.stringify([DQ.KeyDeliverableId]), ActorUserId: PM }));
  // Test cases (migration 062, ADR-0060): a test keeps its pass tick and goes on any WBS level but
  // the first.
  const tc1 = await create({
    ProjectId: P, RequirementType: "TC", Requirement: "Submit the form", IsMet: true,
    ValidatesIds: JSON.stringify([fr1.RequirementId]), ActorUserId: PM,
  });
  ok(tc1.IsMet === true && tc1.Ref === "TC-1", `a test case is TC-1 and keeps its pass tick (got ${tc1.Ref})`);
  const fr1Tested = (await exec("usp_Requirement_GetById", { RequirementId: fr1.RequirementId, ActorUserId: PM }))[0][0];
  ok(links(fr1Tested, "ValidatedByJson").some((r) => r.id === tc1.RequirementId && r.isMet === true),
    "the solution lists the passed test case downstream");
  ok(links(fr1Tested, "ValidatesJson").length === 2, "the solution keeps its needs upstream");
  await expectCode(50004, "a solution cannot trace to a test case until a rule allows it", () =>
    create({ ProjectId: P, RequirementType: "FR", Requirement: "bad",
             ValidatesIds: JSON.stringify([tc1.RequirementId]), ActorUserId: PM }));
  await expectCode(50004, "a test case cannot go on a level 1 WBS item", () =>
    create({ ProjectId: P, RequirementType: "TC", Requirement: "bad",
             KeyDeliverableIds: JSON.stringify([D1.KeyDeliverableId]), ActorUserId: PM }));
  const [[D1a]] = await exec("usp_KeyDeliverable_Create", {
    ProjectId: P, KeyRequirement: "D1a", StartDate: new Date("2026-01-05"), Deadline: new Date("2026-01-12"),
    ParentKeyDeliverableId: D1.KeyDeliverableId, ActorUserId: PM,
  });
  const tcLow = await create({ ProjectId: P, RequirementType: "TC", Requirement: "On level 2",
                               KeyDeliverableIds: JSON.stringify([D1a.KeyDeliverableId]), ActorUserId: PM });
  ok(links(tcLow, "DeliverablesJson").length === 1, "a test case goes on a level 2 WBS item");

  // Configurable links (ADR-0060): the seed lets a row sit at or below its upstream type.
  const tcSkip = await create({ ProjectId: P, RequirementType: "TC", Requirement: "Skips levels",
                                ValidatesIds: JSON.stringify([br1.RequirementId]), ActorUserId: PM });
  ok(links(tcSkip, "ValidatesJson").length === 1, "a skip-level link is allowed");
  const frSame = await create({ ProjectId: P, RequirementType: "FR", Requirement: "Same type",
                                ValidatesIds: JSON.stringify([fr1.RequirementId]), ActorUserId: PM });
  ok(links(frSame, "ValidatesJson").length === 1, "a same-type link is allowed");
  const brOnWbs = await create({ ProjectId: P, RequirementType: "BR", Requirement: "On a WBS item",
                                 KeyDeliverableIds: JSON.stringify([D1.KeyDeliverableId]), ActorUserId: PM });
  ok(links(brOnWbs, "DeliverablesJson").length === 1, "a need can go on a WBS item");
  await expectCode(50004, "a link that closes a loop is refused", () =>
    exec("usp_Requirement_Update", {
      RequirementId: fr1.RequirementId, RequirementType: "FR", Requirement: "Online form", IsMet: 0,
      ValidatesSet: 1, ValidatesIds: JSON.stringify([frSame.RequirementId]), RowVer: fr1.RowVer, ActorUserId: PM,
    }));
  const srChain = await create({ ProjectId: P, RequirementType: "SR", Requirement: "Rule chain", ActorUserId: PM });
  const trDown = await create({ ProjectId: P, RequirementType: "TR", Requirement: "Rule down",
                                ValidatesIds: JSON.stringify([srChain.RequirementId]), ActorUserId: PM });
  await exec("usp_RequirementLinkRule_Set", { DownstreamType: "TR", UpstreamType: "SR", Allowed: 0, ActorUserId: ADMIN });
  try {
    const kept = (await exec("usp_Requirement_Update", {
      RequirementId: trDown.RequirementId, RequirementType: "TR", Requirement: "Rule down", IsMet: 0,
      ValidatesSet: 1, ValidatesIds: JSON.stringify([srChain.RequirementId]), RowVer: trDown.RowVer, ActorUserId: PM,
    }))[0][0];
    ok(links(kept, "ValidatesJson").length === 1, "a kept link survives a removed rule");
    await expectCode(50004, "a removed rule refuses a new link", () =>
      create({ ProjectId: P, RequirementType: "TR", Requirement: "bad",
               ValidatesIds: JSON.stringify([srChain.RequirementId]), ActorUserId: PM }));
  } finally {
    await exec("usp_RequirementLinkRule_Set", { DownstreamType: "TR", UpstreamType: "SR", Allowed: 1, ActorUserId: ADMIN });
  }
  await expectCode(50003, "only an Admin edits the rules", () =>
    exec("usp_RequirementLinkRule_Set", { DownstreamType: "TR", UpstreamType: "SR", Allowed: 0, ActorUserId: PM }));
  await exec("usp_RequirementLinkRule_Set", { DownstreamType: "SR", UpstreamType: "TC", Allowed: 1, ActorUserId: ADMIN });
  try {
    const srBack = await create({ ProjectId: P, RequirementType: "SR", Requirement: "Backwards",
                                  ValidatesIds: JSON.stringify([tc1.RequirementId]), ActorUserId: PM });
    ok(links(srBack, "ValidatesJson").length === 1, "a backwards link works once a rule allows it");
  } finally {
    await exec("usp_RequirementLinkRule_Set", { DownstreamType: "SR", UpstreamType: "TC", Allowed: 0, ActorUserId: ADMIN });
  }
  const rules = (await exec("usp_RequirementLinkRule_List", { ActorUserId: VIEWER }))[0];
  ok(rules.some((r) => r.DownstreamType === "TR" && r.UpstreamType === "SR")
     && !rules.some((r) => r.DownstreamType === "SR" && r.UpstreamType === "TC"),
    "the rule list reads the current rules");
  const frTested = await create({ ProjectId: P, RequirementType: "FR", Requirement: "Tested only", ActorUserId: PM });
  const tc2 = await create({
    ProjectId: P, RequirementType: "TC", Requirement: "Check it",
    ValidatesIds: JSON.stringify([frTested.RequirementId]), ActorUserId: PM,
  });
  await expectCode(50004, "a type change cannot leave a link the rules refuse (upstream)", () =>
    exec("usp_Requirement_Update", {
      RequirementId: srChain.RequirementId, RequirementType: "TC", Requirement: "Rule chain", IsMet: 0,
      RowVer: srChain.RowVer, ActorUserId: PM,
    }));
  await expectCode(50004, "a type change cannot leave a link the rules refuse (downstream)", () =>
    exec("usp_Requirement_Update", {
      RequirementId: tc2.RequirementId, RequirementType: "BR", Requirement: "Check it", IsMet: 0,
      RowVer: tc2.RowVer, ActorUserId: PM,
    }));
  const tc2Passed = (await exec("usp_Requirement_Update", {
    RequirementId: tc2.RequirementId, RequirementType: "TC", Requirement: "Check it", IsMet: 1,
    RowVer: tc2.RowVer, ActorUserId: PM,
  }))[0][0];
  ok(tc2Passed.IsMet === true && links(tc2Passed, "ValidatesJson").length === 1,
    "a cell edit ticks a test case passed and leaves its link alone");

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
  await expectCode(50004, "cannot turn a linked, allocated solution into a test case on level 1", () =>
    exec("usp_Requirement_Update", {
      RequirementId: fr1.RequirementId, RequirementType: "TC", Requirement: "Online form", IsMet: 0,
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
  await exec("usp_Requirement_Delete", { RequirementId: fr1.RequirementId, RowVer: fresh.RowVer, ActorUserId: PM,
    ChildAction: "Orphan" });
  const br1after = (await exec("usp_Requirement_GetById", { RequirementId: br1.RequirementId, ActorUserId: PM }))[0][0];
  ok(!links(br1after, "ValidatedByJson").some((r) => r.id === fr1.RequirementId), "the deleted solution no longer validates its needs");
  g = await gantt(P);
  ok(!reqsOf(g, D2.KeyDeliverableId).some((r) => r.id === fr1.RequirementId), "it is gone from the cascade");
  const fr2 = await create({ ProjectId: P, RequirementType: "FR", Requirement: "Second form", ActorUserId: PM });
  ok(fr2.Number === frTested.Number + 1, "a reference number is never reused after a delete");

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

  // The client asked for no limit, so the only cap is the 50 levels a reference can carry.
  const great = await create({ ProjectId: P, Requirement: "Mod 10", ParentRequirementId: grand.RequirementId, ActorUserId: PM });
  ok(great.Depth === 3, "the fourth level is allowed");
  let deepest = await create({ ProjectId: P, Requirement: "Level 5", ParentRequirementId: great.RequirementId, ActorUserId: PM });
  ok(deepest.Depth === 4, "a fifth level is allowed now");
  while (deepest.Depth < 49) {
    deepest = await create({ ProjectId: P, Requirement: `Level ${deepest.Depth + 2}`,
      ParentRequirementId: deepest.RequirementId, ActorUserId: PM });
  }
  ok(deepest.Ref === `FR-${root.Number}.1.1.1${".1".repeat(46)}`,
    `the 50th level carries its whole path untruncated (got ${deepest.Ref.length} characters)`);
  await expectCode(50004, "a 51st level is refused", () =>
    create({ ProjectId: P, Requirement: "too deep", ParentRequirementId: deepest.RequirementId, ActorUserId: PM }));

  // A parent cannot point outside its project, and a missing one is not found.
  await expectCode(50001, "a parent in another project is not found", () =>
    create({ ProjectId: Q, Requirement: "cross", ParentRequirementId: root.RequirementId, ActorUserId: PM }));
  await expectCode(50001, "a parent that does not exist is not found", () =>
    create({ ProjectId: P, Requirement: "orphan", ParentRequirementId: 2000000000, ActorUserId: PM }));

  // Both refusals stay the default (the client's choice); the delete one can move the children up instead.
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

  // Asked to, a delete moves the children up one level, numbered after every number used there
  // (kid3's deleted 3 and the deleted parent's own 4 included), with their own children in tow.
  const mid = await create({ ProjectId: P, Requirement: "Payment rules", ParentRequirementId: root.RequirementId, ActorUserId: PM });
  const midA = await create({ ProjectId: P, Requirement: "Rule A", ParentRequirementId: mid.RequirementId, ActorUserId: PM });
  const midB = await create({ ProjectId: P, Requirement: "Rule B", ParentRequirementId: mid.RequirementId, ActorUserId: PM });
  const midA1 = await create({ ProjectId: P, Requirement: "Rule A detail", ParentRequirementId: midA.RequirementId, ActorUserId: PM });
  ok(mid.Number === 4, `the next child number counts the deleted one (got ${mid.Number})`);
  const midNow = await getReq(mid.RequirementId);
  await expectCode(50004, "without the flag a parent is still refused", () =>
    exec("usp_Requirement_Delete", { RequirementId: mid.RequirementId, RowVer: midNow.RowVer, ActorUserId: PM }));
  await expectCode(50002, "a stale version moves nothing", () =>
    exec("usp_Requirement_Delete", { RequirementId: mid.RequirementId, RowVer: midNow.RowVer - 1,
      ActorUserId: PM, ChildAction: "Orphan" }));
  ok((await getReq(midA.RequirementId)).Ref === `FR-${root.Number}.4.1`, "a refused move leaves the children where they were");
  await exec("usp_Requirement_Delete", { RequirementId: mid.RequirementId, RowVer: midNow.RowVer,
    ActorUserId: PM, ChildAction: "Orphan" });
  const [upA, upB, upA1] = [await getReq(midA.RequirementId), await getReq(midB.RequirementId), await getReq(midA1.RequirementId)];
  ok(upA.Ref === `FR-${root.Number}.5` && upB.Ref === `FR-${root.Number}.6` && upA.Depth === 1,
    `the children move under the grandparent in their old order (got ${upA.Ref}, ${upB.Ref})`);
  ok(upA1.Ref === `FR-${root.Number}.5.1` && upA1.Depth === 2, `a grandchild travels with its parent (got ${upA1.Ref})`);
  ok(upA.ChildCount === 1 && (await getReq(root.RequirementId)).ChildCount === 4,
    "the grandparent counts the moved children as its own");
  const [auditPage] = await exec("usp_Audit_List", { ActorUserId: ADMIN, Search: "app.Requirement", PageSize: 100 });
  const movedRow = auditPage.find((r) => r.EntityName === "app.Requirement" && r.Action === "Update"
    && String(r.EntityId) === String(midA.RequirementId));
  const moved = (await exec("usp_Audit_GetById", { AuditLogId: movedRow.AuditLogId, ActorUserId: ADMIN }))[0][0];
  const was = JSON.parse(moved.BeforeJson), now = JSON.parse(moved.AfterJson);
  ok(was.ParentRequirementId === mid.RequirementId && was.Number === 1
     && now.ParentRequirementId === root.RequirementId && now.Number === 5,
    "each move is audited with its old and new place");

  // A root's children move to the top level and keep the type their references carry.
  const top = await create({ ProjectId: P, RequirementType: "TR", Requirement: "Hosting", ActorUserId: PM });
  const topKid = await create({ ProjectId: P, Requirement: "Backups", ParentRequirementId: top.RequirementId, ActorUserId: PM });
  await exec("usp_Requirement_Delete", { RequirementId: top.RequirementId, RowVer: (await getReq(top.RequirementId)).RowVer,
    ActorUserId: PM, ChildAction: "Orphan" });
  const upTop = await getReq(topKid.RequirementId);
  ok(upTop.Ref === `TR-${top.Number + 1}` && upTop.Depth === 0 && upTop.RequirementType === "TR",
    `a root's child becomes a root after every used number (got ${upTop.Ref})`);

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

  // A link is a record with its own author, date, rationale and status (ADR-0060 section 5).
  const L = await project(`req-link-${stamp}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: L,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });
  const LD = await deliverable(L, "Link WBS");
  const lNeed = await create({ ProjectId: L, RequirementType: "BR", Requirement: "Link need", ActorUserId: PM });
  const lSol = await create({ ProjectId: L, RequirementType: "FR", Requirement: "Link solution",
    KeyDeliverableIds: JSON.stringify([LD.KeyDeliverableId]), ActorUserId: PM });
  const lSr1 = await create({ ProjectId: L, RequirementType: "SR", Requirement: "Chain 1", ActorUserId: PM });
  const lSr2 = await create({ ProjectId: L, RequirementType: "SR", Requirement: "Chain 2", ActorUserId: PM });
  const lSr3 = await create({ ProjectId: L, RequirementType: "SR", Requirement: "Chain 3", ActorUserId: PM });
  const qNeed = await create({ ProjectId: Q, RequirementType: "BR", Requirement: "Other project", ActorUserId: PM });
  const linksOf = async (id, actor = PM) =>
    (await exec("usp_RequirementLink_List", { RequirementId: id, ActorUserId: actor }))[0];
  const linkCreate = (down, up, actor = PM, extra = {}) =>
    exec("usp_RequirementLink_Create", {
      RequirementId: down, UpstreamRequirementId: up, ActorUserId: actor, ...extra,
    });
  const linkUpdate = (down, ids, RowVer, extra = {}, actor = PM) =>
    exec("usp_RequirementLink_Update", {
      RequirementId: down, ...ids, Rationale: null, LinkStatus: "Active", RowVer, ActorUserId: actor, ...extra,
    });
  const linkDelete = (down, up, RowVer, actor = PM) =>
    exec("usp_RequirementLink_Delete", {
      RequirementId: down, UpstreamRequirementId: up, RowVer, ActorUserId: actor,
    });
  const auditActions = async (id) => {
    const [page] = await exec("usp_Audit_List", { ActorUserId: ADMIN, Search: "Link", PageSize: 100 });
    const rows = page.filter((r) => r.Action.startsWith("Link") && String(r.EntityId) === String(id)).reverse();
    const full = [];
    for (const r of rows) {
      full.push((await exec("usp_Audit_GetById", { AuditLogId: r.AuditLogId, ActorUserId: ADMIN }))[0][0]);
    }
    return full;
  };

  await expectCode(50003, "a viewer cannot make a link", () =>
    linkCreate(lSol.RequirementId, lNeed.RequirementId, VIEWER));
  const [[made]] = await linkCreate(lSol.RequirementId, lNeed.RequirementId, CONTRIB, {
    Rationale: "Why it traces",
  });
  ok(made.ProjectId === L, "making a link answers with the project");

  const fromDown = await linksOf(lSol.RequirementId);
  const up = fromDown.find((r) => r.Direction === "Upstream");
  ok(up && up.LinkedId === lNeed.RequirementId && up.LinkedType === "BR" && up.LinkedRef === lNeed.Ref,
    "the downstream row lists its upstream link, with the upstream row's type and reference");
  ok(up && up.LinkedText === "Link need" && up.Rationale === "Why it traces" && up.LinkStatus === "Active",
    "a listed link carries its text, rationale and status, and status defaults to Active");
  ok(up && up.CreatedByName && up.CreatedAtUtc && up.UpdatedAtUtc === null,
    "a new link names its author and date and has no update yet");
  const wbs = fromDown.find((r) => r.Direction === "Wbs");
  ok(wbs && wbs.LinkedId === LD.KeyDeliverableId && wbs.LinkedType === "WBS" && wbs.LinkedRef === null,
    `a WBS link is listed with no reference of its own (got ${wbs ? `"${wbs.LinkedRef}"` : "no row"})`);
  const down = (await linksOf(lNeed.RequirementId, VIEWER)).find((r) => r.Direction === "Downstream");
  ok(down && down.LinkedId === lSol.RequirementId && down.LinkedType === "FR" && down.LinkedRef === lSol.Ref,
    "the upstream row lists the same link as downstream, and a viewer can read it");

  await expectCode(50004, "a backwards pair is refused by the rules", () =>
    linkCreate(lNeed.RequirementId, lSol.RequirementId));
  await expectCode(50004, "a link cannot be made twice", () =>
    linkCreate(lSol.RequirementId, lNeed.RequirementId));
  await expectCode(50004, "a requirement cannot link to itself", () =>
    linkCreate(lNeed.RequirementId, lNeed.RequirementId));
  await expectCode(50004, "a link status outside the set is refused", () =>
    linkCreate(lSol.RequirementId, lSr1.RequirementId, PM, { LinkStatus: "Draft" }));

  let crossMessage;
  let missingMessage;
  await expectCode(50004, "an upstream row in another project is refused", async () => {
    try { await linkCreate(lSol.RequirementId, qNeed.RequirementId); } catch (e) { crossMessage = e.message; throw e; }
  });
  await expectCode(50004, "an upstream row that does not exist is refused", async () => {
    try { await linkCreate(lSol.RequirementId, 2147483646); } catch (e) { missingMessage = e.message; throw e; }
  });
  ok(crossMessage === missingMessage, "another project's row answers exactly like a missing one");

  await expectCode(50003, "a user outside the project cannot read its links", () =>
    linksOf(qNeed.RequirementId, CONTRIB));

  await linkCreate(lSr1.RequirementId, lSr2.RequirementId);
  await linkCreate(lSr2.RequirementId, lSr3.RequirementId);
  await expectCode(50004, "a link that closes a loop is refused", () =>
    linkCreate(lSr3.RequirementId, lSr1.RequirementId));
  ok(!(await linksOf(lSr3.RequirementId)).some((r) => r.Direction === "Upstream"),
    "a refused loop leaves no link behind");
  await linkCreate(lSol.RequirementId, lSr3.RequirementId, PM, { LinkStatus: "Proposed" });
  ok((await linksOf(lSol.RequirementId)).find((r) => r.LinkedId === lSr3.RequirementId).LinkStatus === "Proposed",
    "a link can start as Proposed");

  await expectCode(50003, "a viewer cannot change a link", () =>
    linkUpdate(lSol.RequirementId, { UpstreamRequirementId: lNeed.RequirementId }, up.RowVer, {}, VIEWER));
  await expectCode(50004, "an update names one link, not none", () =>
    linkUpdate(lSol.RequirementId, {}, up.RowVer));
  await expectCode(50004, "an update names one link, not both", () =>
    linkUpdate(lSol.RequirementId, {
      UpstreamRequirementId: lNeed.RequirementId, KeyDeliverableId: LD.KeyDeliverableId,
    }, up.RowVer));
  await linkUpdate(lSol.RequirementId, { UpstreamRequirementId: lNeed.RequirementId }, up.RowVer, {
    Rationale: "Changed", LinkStatus: "Retired",
  }, CONTRIB);
  const changed = (await linksOf(lSol.RequirementId)).find((r) => r.LinkedId === lNeed.RequirementId);
  ok(changed.Rationale === "Changed" && changed.LinkStatus === "Retired" && changed.UpdatedAtUtc,
    "an update changes the rationale and status and stamps the date");
  ok(changed.CreatedByName === up.CreatedByName
     && +changed.CreatedAtUtc === +up.CreatedAtUtc, "an update keeps the author and date");
  ok(String(changed.RowVer) !== String(up.RowVer), "an update moves the link's version");
  await expectCode(50002, "a stale link update answers a conflict", () =>
    linkUpdate(lSol.RequirementId, { UpstreamRequirementId: lNeed.RequirementId }, up.RowVer));

  await exec("usp_RequirementLinkRule_Set", { DownstreamType: "FR", UpstreamType: "BR", Allowed: 0, ActorUserId: ADMIN });
  try {
    await linkUpdate(lSol.RequirementId, { UpstreamRequirementId: lNeed.RequirementId }, changed.RowVer, {
      Rationale: "Changed", LinkStatus: "Active",
    });
    ok((await linksOf(lSol.RequirementId)).find((r) => r.LinkedId === lNeed.RequirementId).LinkStatus === "Active",
      "a retired link comes back even though its rule was removed");
  } finally {
    await exec("usp_RequirementLinkRule_Set", { DownstreamType: "FR", UpstreamType: "BR", Allowed: 1, ActorUserId: ADMIN });
  }

  await linkUpdate(lSol.RequirementId, { KeyDeliverableId: LD.KeyDeliverableId }, wbs.RowVer, {
    Rationale: "WBS reason", LinkStatus: "Proposed",
  });
  const wbsAfter = (await linksOf(lSol.RequirementId)).find((r) => r.Direction === "Wbs");
  ok(wbsAfter.Rationale === "WBS reason" && wbsAfter.LinkStatus === "Proposed",
    "a WBS link takes a rationale and status too");
  const solRow = await getReq(lSol.RequirementId);
  await exec("usp_Requirement_Update", {
    RequirementId: lSol.RequirementId, RequirementType: solRow.RequirementType, Requirement: solRow.Requirement,
    IsMet: 0, DeliverablesSet: 1, KeyDeliverableIds: JSON.stringify([LD.KeyDeliverableId]),
    RowVer: solRow.RowVer, ActorUserId: PM,
  });
  const wbsKept = (await linksOf(lSol.RequirementId)).find((r) => r.Direction === "Wbs");
  ok(wbsKept.Rationale === "WBS reason" && wbsKept.LinkStatus === "Proposed"
     && String(wbsKept.RowVer) === String(wbsAfter.RowVer),
    "a form save with the same deliverables leaves a WBS link's record alone");
  await expectCode(50002, "a stale WBS link update answers a conflict", () =>
    linkUpdate(lSol.RequirementId, { KeyDeliverableId: LD.KeyDeliverableId }, wbs.RowVer));

  const current = (await linksOf(lSol.RequirementId)).find((r) => r.LinkedId === lNeed.RequirementId);
  await expectCode(50003, "a viewer cannot remove a link", () =>
    linkDelete(lSol.RequirementId, lNeed.RequirementId, current.RowVer, VIEWER));
  await expectCode(50002, "a stale link delete answers a conflict", () =>
    linkDelete(lSol.RequirementId, lNeed.RequirementId, up.RowVer));
  await linkDelete(lSol.RequirementId, lNeed.RequirementId, current.RowVer, CONTRIB);
  ok(!(await linksOf(lSol.RequirementId)).some((r) => r.LinkedId === lNeed.RequirementId),
    "a removed link is gone from the list");
  ok((await getReq(lNeed.RequirementId)).RequirementId === lNeed.RequirementId
     && (await getReq(lSol.RequirementId)).RequirementId === lSol.RequirementId,
    "removing a link keeps both requirements");
  await expectCode(50001, "a link that is gone cannot be updated", () =>
    linkUpdate(lSol.RequirementId, { UpstreamRequirementId: lNeed.RequirementId }, current.RowVer));
  await expectCode(50001, "a link that is gone cannot be removed", () =>
    linkDelete(lSol.RequirementId, lNeed.RequirementId, current.RowVer));

  const trail = await auditActions(lSol.RequirementId);
  const count = (action) => trail.filter((a) => a.Action === action).length;
  ok(count("LinkCreate") === 2, `each new link writes one audit row (got ${count("LinkCreate")})`);
  ok(count("LinkUpdate") === 3, `each link change writes one audit row (got ${count("LinkUpdate")})`);
  ok(count("LinkDelete") === 1, `a removed link writes one audit row (got ${count("LinkDelete")})`);
  ok(JSON.parse(trail.find((a) => a.Action === "LinkDelete").BeforeJson).rationale === "Changed",
    "the audit row keeps the rationale of a removed link");
  ok(trail.some((a) => a.Action === "LinkUpdate" && a.EntityName === "app.RequirementDeliverable"),
    "a WBS link change is audited against its own table");

  // ---- Deleting a parent: the choice and the walk (ADR-0060 section 8) ----
  const X = await project(`req-del-${stamp}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: X,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });
  const XD = await deliverable(X, "Delete WBS");
  const idsOf = (rows) => JSON.stringify(rows.map((r) => r.RequirementId).sort((a, b) => a - b));
  const upstream = (rows) => JSON.stringify(rows.map((r) => r.RequirementId));
  const fresh2 = (type, ups = [], extra = {}) =>
    create({ ProjectId: X, RequirementType: type, Requirement: `${type} row`, ValidatesIds: upstream(ups), ActorUserId: PM, ...extra });
  const sub = (parent) =>
    create({ ProjectId: X, Requirement: "Sub row", ParentRequirementId: parent.RequirementId, ActorUserId: PM });
  const impactOf = async (id, actor = PM) =>
    (await exec("usp_Requirement_DeleteImpact", { RequirementId: id, ActorUserId: actor }))[0];
  const fate = (rows, name) => idsOf(rows.filter((r) => r.Fate === name));
  const doomedIds = (impact) =>
    JSON.stringify(impact.filter((r) => r.Fate === "Deleted").map((r) => r.RequirementId));
  const remove = async (row, params = {}, actor = PM) => {
    const current = await getReq(row.RequirementId);
    return exec("usp_Requirement_Delete", { RequirementId: row.RequirementId, RowVer: current.RowVer, ActorUserId: actor, ...params });
  };
  const alive = (row) =>
    getReq(row.RequirementId).then(
      (found) => Boolean(found),
      (e) => {
        if (e.number === 50001) return false;
        throw e;
      },
    );
  const allAlive = async (rows) => (await Promise.all(rows.map(alive))).every(Boolean);
  const noneAlive = async (rows) => !(await Promise.all(rows.map(alive))).some(Boolean);

  const oNeed = await fresh2("BR");
  const oSol = await fresh2("FR", [oNeed]);
  await expectCode(50004, "a row with only a downstream link is refused without a choice", () => remove(oNeed));
  await expectCode(50004, "an unknown choice is refused", () => remove(oNeed, { ChildAction: "Sideways" }));
  await remove(oNeed, { ChildAction: "Orphan" });
  ok(!(await alive(oNeed)) && (await alive(oSol)), "Orphan deletes the row and keeps the one below it");
  ok(links(await getReq(oSol.RequirementId), "ValidatesJson").length === 0, "Orphan removes the link");

  const tree = await fresh2("BR");
  const treeKid = await sub(tree);
  const treeLeaf = await sub(treeKid);
  const treeImpact = await impactOf(tree.RequirementId);
  ok(fate(treeImpact, "Deleted") === idsOf([tree, treeKid, treeLeaf]), "the impact lists the sub-requirement tree");
  ok(treeImpact.every((r) => r.Ref && r.RequirementType === "BR"), "the impact carries each reference and type");
  await remove(tree, { ChildAction: "Delete", ExpectedDeleteIds: doomedIds(treeImpact) });
  ok(await noneAlive([tree, treeKid, treeLeaf]), "Delete takes the sub-requirement tree");

  const brA = await fresh2("BR");
  const brB = await fresh2("BR");
  const shared = await fresh2("FR", [brA, brB]);
  const sharedImpact = await impactOf(brA.RequirementId);
  ok(fate(sharedImpact, "Deleted") === idsOf([brA]), "a row with another upstream link is not in the delete");
  ok(fate(sharedImpact, "Unlinked") === idsOf([shared]), "the impact lists the row that stays");
  await remove(brA, { ChildAction: "Delete", ExpectedDeleteIds: doomedIds(sharedImpact) });
  const sharedKept = links(await getReq(shared.RequirementId), "ValidatesJson");
  ok(sharedKept.length === 1 && sharedKept[0].id === brB.RequirementId, "it survives and keeps its other need");

  const wNeed = await fresh2("BR");
  const onWbs = await fresh2("FR", [wNeed], { KeyDeliverableIds: JSON.stringify([XD.KeyDeliverableId]) });
  const wImpact = await impactOf(wNeed.RequirementId);
  ok(fate(wImpact, "Unlinked") === idsOf([onWbs]), "a row on a WBS item is kept in the impact");
  await remove(wNeed, { ChildAction: "Delete", ExpectedDeleteIds: doomedIds(wImpact) });
  ok(links(await getReq(onWbs.RequirementId), "DeliverablesJson").length === 1, "a row on a WBS item survives and stays on it");

  const cNeed = await fresh2("BR");
  const cSol = await fresh2("FR", [cNeed]);
  const cSub = await sub(cSol);
  const cTest = await fresh2("TC", [cSub]);
  const cOther = await fresh2("FR");
  const cShared = await fresh2("TC", [cSub, cOther]);
  const chain = [cNeed, cSol, cSub, cTest];
  const chainImpact = await impactOf(cNeed.RequirementId);
  ok(fate(chainImpact, "Deleted") === idsOf(chain), "the walk reaches a row only a doomed sub-requirement holds");
  ok(fate(chainImpact, "Unlinked") === idsOf([cShared]), "the walk stops at a row with a surviving upstream");
  await expectCode(50002, "a changed set is a conflict", () =>
    remove(cNeed, { ChildAction: "Delete", ExpectedDeleteIds: JSON.stringify(chain.slice(0, 3).map((r) => r.RequirementId)) }));
  await expectCode(50002, "a missing set is a conflict", () => remove(cNeed, { ChildAction: "Delete" }));
  ok(await allAlive(chain), "a refused delete removes nothing");
  await remove(cNeed, { ChildAction: "Delete", ExpectedDeleteIds: doomedIds(chainImpact) });
  ok(await noneAlive(chain), "what the delete removed is what the impact showed");
  const cSharedKept = links(await getReq(cShared.RequirementId), "ValidatesJson");
  ok(cSharedKept.length === 1 && cSharedKept[0].id === cOther.RequirementId, "the kept row loses only the doomed link");
  const [deletes] = await exec("usp_Audit_List", { ActorUserId: ADMIN, Search: "Delete", PageSize: 100 });
  const auditedOnce = (row) =>
    deletes.filter((r) => r.Action === "Delete" && String(r.EntityId) === String(row.RequirementId)).length === 1;
  ok(chain.every(auditedOnce), "each deleted row has one Delete audit row");
  const [chainAudit] = deletes.filter((r) => r.Action === "Delete" && String(r.EntityId) === String(cTest.RequirementId));
  const chainBefore = (await exec("usp_Audit_GetById", { AuditLogId: chainAudit.AuditLogId, ActorUserId: ADMIN }))[0][0];
  ok(JSON.parse(chainBefore.BeforeJson).RequirementId === cTest.RequirementId, "the audit row keeps the row it deleted");

  const guarded = await fresh2("BR");
  const guardedKid = await sub(guarded);
  await expectCode(50003, "a Viewer cannot read the impact", () => impactOf(guarded.RequirementId, VIEWER));
  await expectCode(50003, "a Contributor cannot read the impact", () => impactOf(guarded.RequirementId, CONTRIB));
  await expectCode(50003, "an id in another project does not answer (IDOR)", () => impactOf(reqQ.RequirementId, VIEWER));
  await expectCode(50003, "an outsider cannot delete another project's row (IDOR)", () =>
    exec("usp_Requirement_Delete", { RequirementId: reqQ.RequirementId, RowVer: 1, ActorUserId: VIEWER,
      ChildAction: "Delete", ExpectedDeleteIds: JSON.stringify([reqQ.RequirementId]) }));
  await expectCode(50003, "a Contributor cannot delete with children", () =>
    remove(guarded, { ChildAction: "Delete", ExpectedDeleteIds: JSON.stringify([guarded.RequirementId, guardedKid.RequirementId]) }, CONTRIB));
  ok(await allAlive([guarded, guardedKid]), "a refused actor removes nothing");
  await expectCode(50001, "a deleted row has no impact", () => impactOf(cNeed.RequirementId));

  // A Retired link stays on record, out of the chips, and a sheet save leaves it alone (ADR-0060).
  const rowOf = async (id) =>
    (await exec("usp_Requirement_GetById", { RequirementId: id, ActorUserId: PM }))[0][0];
  const saveUpstream = async (row, ups) => {
    const now = await rowOf(row.RequirementId);
    await exec("usp_Requirement_Update", {
      RequirementId: row.RequirementId, RequirementType: now.RequirementType, Requirement: now.Requirement,
      IsMet: 0, ValidatesSet: 1, ValidatesIds: upstream(ups), RowVer: now.RowVer, ActorUserId: PM,
    });
  };
  const setStatus = async (down, up, LinkStatus) => {
    const link = (await linksOf(down.RequirementId)).find(
      (r) => r.Direction === "Upstream" && r.LinkedId === up.RequirementId,
    );
    await linkUpdate(down.RequirementId, { UpstreamRequirementId: up.RequirementId }, link.RowVer, { LinkStatus });
  };
  const rNeed = await fresh2("BR");
  const rSol = await fresh2("FR", [rNeed]);
  await setStatus(rSol, rNeed, "Proposed");
  ok(JSON.parse((await rowOf(rNeed.RequirementId)).ValidatedByJson)[0].status === "Proposed", "a Proposed link shows, marked");
  await setStatus(rSol, rNeed, "Retired");
  ok(!(await rowOf(rSol.RequirementId)).ValidatesJson, "a Retired link leaves the upstream chips");
  ok(!(await rowOf(rNeed.RequirementId)).ValidatedByJson, "a Retired link leaves the downstream chips");
  ok((await linksOf(rSol.RequirementId)).some((r) => r.LinkStatus === "Retired"), "a Retired link stays on record");
  await saveUpstream(rSol, []);
  ok((await linksOf(rSol.RequirementId)).some((r) => r.LinkStatus === "Retired"), "a sheet save keeps a Retired link it never saw");
  await saveUpstream(rSol, [rNeed]);
  ok((await linksOf(rSol.RequirementId)).some((r) => r.LinkStatus === "Active"), "picking it again makes it Active");
  await setStatus(rSol, rNeed, "Retired");
  await remove(rNeed);
  ok(await alive(rSol), "a Retired link does not stop a plain delete, and the row below stays");

  const heldA = await fresh2("BR");
  const heldB = await fresh2("BR");
  const held = await fresh2("FR", [heldA, heldB]);
  await setStatus(held, heldB, "Retired");
  await remove(heldA, { ChildAction: "Delete", ExpectedDeleteIds: JSON.stringify([heldA.RequirementId]) });
  ok(await alive(held), "a Retired link still holds a row back from the cascade");

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
