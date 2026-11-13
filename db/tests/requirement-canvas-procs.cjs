// Behaviour checks for the requirement canvas procs (ADR-0061): canvas create, rename and delete,
// reveal, move and hide of nodes, the whole-project Items and Links reads, and the one-at-a-time WBS
// link. Runs against the seeded database in the CI db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm,
// 4 e2e-contributor, 5 e2e-viewer) and locally: node db/tests/requirement-canvas-procs.cjs. Creates
// throwaway projects and leaves soft-deleted rows behind, so never point it at a real database.
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
async function deliverable(projectId, name, parent = null) {
  const params = {
    ProjectId: projectId, KeyRequirement: name, StartDate: new Date("2026-01-05"),
    Deadline: new Date("2026-01-12"), ActorUserId: PM,
  };
  if (parent) params.ParentKeyDeliverableId = parent;
  const [[row]] = await exec("usp_KeyDeliverable_Create", params);
  return row.KeyDeliverableId;
}
async function requirement(projectId, type, text, extra = {}) {
  const [[row]] = await exec("usp_Requirement_Create", {
    ProjectId: projectId, RequirementType: type, Requirement: text, ActorUserId: PM, ...extra,
  });
  return row;
}
const canvas = async (projectId, name, keyDeliverableId = null, actor = PM) =>
  (await exec("usp_RequirementCanvas_Create", {
    ProjectId: projectId, Name: name, KeyDeliverableId: keyDeliverableId, ActorUserId: actor,
  }))[0][0];
const summaries = async (projectId) =>
  (await exec("usp_RequirementCanvas_List", { ProjectId: projectId, ActorUserId: PM }))[0];
const items = async (id, actor = PM) =>
  (await exec("usp_RequirementCanvas_Items", { RequirementCanvasId: id, ActorUserId: actor }))[0];
const drawn = async (id, actor = PM) =>
  (await exec("usp_RequirementCanvas_Links", { RequirementCanvasId: id, ActorUserId: actor }))[0];
const add = (id, item, actor = PM) =>
  exec("usp_RequirementCanvasNode_Add", { RequirementCanvasId: id, ActorUserId: actor, ...item });
const move = (id, nodes, actor = PM) =>
  exec("usp_RequirementCanvasNode_Move", {
    RequirementCanvasId: id, NodesJson: typeof nodes === "string" ? nodes : JSON.stringify(nodes), ActorUserId: actor,
  });
const allocate = (requirementId, keyDeliverableId, actor = PM) =>
  exec("usp_Requirement_Allocate", { RequirementId: requirementId, KeyDeliverableId: keyDeliverableId, ActorUserId: actor });
const itemOf = (rows, kind, id) => rows.find((r) => r.Kind === kind && r.ItemId === id);
const wbsLinks = async (requirementId) =>
  (await exec("usp_RequirementLink_List", { RequirementId: requirementId, ActorUserId: PM }))[0].filter((l) => l.Direction === "Wbs");

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 300000,
  });
  const stamp = Date.now();
  const P = await project(`canvas-${stamp}`);
  const Q = await project(`canvas-q-${stamp}`);
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
  const D11 = await deliverable(P, "D1 child", D1);
  const D2 = await deliverable(P, "D2");
  const DQ = await deliverable(Q, "DQ");
  const br = await requirement(P, "BR", "Need ".repeat(100), { AcceptanceCriteria: "Check ".repeat(100) });
  const fr = await requirement(P, "FR", "Function", { ValidatesIds: JSON.stringify([br.RequirementId]) });
  const fr2 = await requirement(P, "FR", "Second function");
  const gone = await requirement(P, "BR", "Deleted later");
  const rq = await requirement(Q, "BR", "Other project");

  // Canvas details.
  await expectCode(50003, "a Viewer cannot create a canvas", () => canvas(P, "v", null, VIEWER));
  await expectCode(50003, "an outsider cannot create a canvas", () => canvas(Q, "c", null, CONTRIB));
  await expectCode(50004, "a blank name is refused", () => canvas(P, "   "));
  await expectCode(50004, "a name over 120 is refused", () => canvas(P, "x".repeat(121)));
  const C = await canvas(P, "Main", null, CONTRIB);
  await expectCode(50005, "a duplicate name is refused", () => canvas(P, "Main"));
  ok(Boolean(await canvas(Q, "Main")), "the same name in another project is allowed");
  await expectCode(50004, "a WBS item of another project is refused", () => canvas(P, "Bad", DQ));
  const filedA = await canvas(P, "Filed A", D1);
  const filedB = await canvas(P, "Filed B", D1);
  ok(filedA.KeyDeliverableId === D1 && filedB.KeyDeliverableId === D1, "one WBS item holds two canvases");
  const update = (row, name, actor = PM) => exec("usp_RequirementCanvas_Update", {
    RequirementCanvasId: row.RequirementCanvasId, Name: name, KeyDeliverableId: row.KeyDeliverableId,
    RowVer: row.RowVer, ActorUserId: actor,
  });
  await update(filedA, "Filed A2");
  const renamed = (await summaries(P)).find((s) => s.RequirementCanvasId === filedA.RequirementCanvasId);
  ok(renamed.Name === "Filed A2" && String(renamed.RowVer) !== String(filedA.RowVer), "a rename moves the RowVer");
  await expectCode(50002, "a stale rename is refused", () => update(filedA, "Late"));
  const remove = (row, actor = PM) => exec("usp_RequirementCanvas_Delete", {
    RequirementCanvasId: row.RequirementCanvasId, RowVer: row.RowVer, ActorUserId: actor,
  });
  await expectCode(50003, "a Contributor cannot delete a canvas", () => remove(renamed, CONTRIB));
  await expectCode(50002, "a stale delete is refused", () => remove(filedA));
  await remove(renamed);
  await expectCode(50001, "Items answers not found after a delete", () => items(renamed.RequirementCanvasId));
  await expectCode(50001, "Links answers not found after a delete", () => drawn(renamed.RequirementCanvasId));
  ok(Boolean(await canvas(P, "Filed A2")), "a deleted canvas frees its name");
  const canvasAudit = (await exec("usp_Audit_List", { ActorUserId: ADMIN, Search: "Canvas", PageSize: 100 }))[0]
    .filter((r) => String(r.EntityId) === String(renamed.RequirementCanvasId));
  ok(canvasAudit.length === 3, `create, rename and delete each write one audit row (got ${canvasAudit.length})`);

  // Reveal.
  const id = C.RequirementCanvasId;
  await expectCode(50004, "add with both ids is refused", () => add(id, { RequirementId: br.RequirementId, KeyDeliverableId: D1 }));
  await expectCode(50004, "add with no id is refused", () => add(id, {}));
  await expectCode(50004, "half a position is refused", () => add(id, { RequirementId: br.RequirementId, X: 5 }));
  await expectCode(50004, "another project's item is refused", () => add(id, { RequirementId: rq.RequirementId }));
  await expectCode(50003, "a Viewer cannot add a node", () => add(id, { RequirementId: br.RequirementId }, VIEWER));
  await add(id, { RequirementId: br.RequirementId, X: 10, Y: 20 }, CONTRIB);
  await add(id, { RequirementId: br.RequirementId, X: 99, Y: 99 });
  await add(id, { KeyDeliverableId: D11 });
  await add(id, { RequirementId: fr.RequirementId });
  await add(id, { RequirementId: gone.RequirementId });
  let rows = await items(id, VIEWER);
  const brRow = itemOf(rows, "Requirement", br.RequirementId);
  ok(brRow.X === 10 && brRow.Y === 20, "a repeated add keeps the first position");
  ok(brRow.OnCanvas === true && brRow.IsCollapsed === false, "OnCanvas and IsCollapsed come back as booleans");
  ok(brRow.Title.length === 400, `Title is cut at 400 (got ${brRow.Title.length})`);
  ok(brRow.Summary?.length === 400, `Summary is cut at 400 (got ${brRow.Summary?.length})`);
  ok(brRow.Status === "NotMet" && brRow.Type === "BR", "a requirement reads its status and type");
  const wbsRow = itemOf(rows, "Wbs", D11);
  ok(wbsRow.Ref === "1.1" && wbsRow.Type === "WBS" && wbsRow.ParentId === D1, `a WBS item reads its code (got ${wbsRow.Ref})`);
  ok(itemOf(rows, "Wbs", D2).OnCanvas === false, "an item not revealed reads as off the canvas");
  ok(!rows.some((r) => r.ItemId === rq.RequirementId && r.Kind === "Requirement"), "Items stays inside the project");
  ok(!rows.some((r) => r.ItemId === DQ && r.Kind === "Wbs"), "Items leaves out another project's WBS item");
  await exec("usp_Requirement_Delete", { RequirementId: gone.RequirementId, RowVer: gone.RowVer, ActorUserId: PM });
  await expectCode(50004, "a deleted item is refused like a missing one", () => add(id, { RequirementId: gone.RequirementId }));
  const counted = (await summaries(P)).find((s) => s.RequirementCanvasId === id);
  ok(counted.NodeCount === 3, `NodeCount leaves out deleted items (got ${counted.NodeCount})`);

  // Links.
  await allocate(fr.RequirementId, D2, CONTRIB);
  const traceId = { RequirementId: fr2.RequirementId, UpstreamRequirementId: br.RequirementId };
  const [[proposed]] = await exec("usp_RequirementLink_Create", { ...traceId, Rationale: null, LinkStatus: "Proposed", ActorUserId: PM });
  let lines = await drawn(id, VIEWER);
  const trace = lines.find((l) => l.UpstreamKind === "Requirement" && l.DownstreamId === fr.RequirementId);
  const wbsLine = lines.find((l) => l.UpstreamKind === "Wbs" && l.UpstreamId === D2);
  ok(trace && trace.LinkStatus === "Active", "an Active trace draws");
  ok(wbsLine && wbsLine.DownstreamId === fr.RequirementId, "a WBS link draws");
  ok(lines.some((l) => l.DownstreamId === fr2.RequirementId && l.LinkStatus === "Proposed"), "a Proposed link draws");
  await exec("usp_RequirementLink_Update", {
    ...traceId, KeyDeliverableId: null, Rationale: null, LinkStatus: "Retired",
    RowVer: lines.find((l) => l.DownstreamId === fr2.RequirementId).RowVer, ActorUserId: PM,
  });
  lines = await drawn(id);
  ok(!lines.some((l) => l.DownstreamId === fr2.RequirementId), "a Retired link does not draw");
  ok(proposed !== undefined, "the link create returned its row");
  const doomed = await requirement(P, "FR", "Doomed", { ValidatesIds: JSON.stringify([br.RequirementId]) });
  await exec("usp_Requirement_Delete", { RequirementId: doomed.RequirementId, RowVer: doomed.RowVer, ActorUserId: PM });
  ok(!(await drawn(id)).some((l) => l.DownstreamId === doomed.RequirementId), "a deleted end is left out");
  await exec("usp_RequirementLink_Delete", {
    RequirementId: fr.RequirementId, UpstreamRequirementId: br.RequirementId, RowVer: trace.RowVer, ActorUserId: PM,
  });
  ok(!(await drawn(id)).some((l) => l.DownstreamId === fr.RequirementId && l.UpstreamKind === "Requirement"),
    "the drawn RowVer works with the link delete");
  await exec("usp_Requirement_Unallocate", {
    RequirementId: fr.RequirementId, KeyDeliverableId: D2, RowVer: wbsLine.RowVer, ActorUserId: PM,
  });
  ok(!(await drawn(id)).some((l) => l.UpstreamKind === "Wbs" && l.UpstreamId === D2 && l.LinkStatus === "Active"),
    "the drawn RowVer works with Unallocate");

  // Move.
  const node = (itemId, x, y, isCollapsed = false, kind = "Requirement") => ({ kind, itemId, x, y, isCollapsed });
  const bad = (label, nodes) => expectCode(50004, label, () => move(id, nodes));
  await expectCode(50003, "a Viewer cannot move", () => move(id, [node(br.RequirementId, 1, 1)], VIEWER));
  await bad("move refuses text that is not JSON", "not json");
  await bad("move refuses a JSON object", "{}");
  await bad("move refuses a missing key", [{ kind: "Requirement", itemId: br.RequirementId, x: 1, y: 1 }]);
  await bad("move refuses a fractional x", [node(br.RequirementId, 1.5, 1)]);
  await bad("move refuses an array of numbers", "[1,2]");
  await bad("move refuses half a position", [node(br.RequirementId, 1, null)]);
  await bad("move refuses an unknown kind", [node(br.RequirementId, 1, 1, false, "Other")]);
  await bad("move refuses a repeated item", [node(br.RequirementId, 1, 1), node(br.RequirementId, 2, 2)]);
  await bad("move refuses over 2,000 rows", Array.from({ length: 2001 }, (_, i) => node(i + 1, 1, 1)));
  const other = await canvas(P, "Other");
  await add(other.RequirementCanvasId, { RequirementId: br.RequirementId, X: 7, Y: 8 });
  await move(id, [node(br.RequirementId, 300, 400, true), node(D11, 5, 6, false, "Wbs"), node(fr2.RequirementId, 9, 9)], CONTRIB);
  rows = await items(id);
  const moved = itemOf(rows, "Requirement", br.RequirementId);
  ok(moved.X === 300 && moved.Y === 400 && moved.IsCollapsed === true, "move saves the position and collapse");
  ok(itemOf(rows, "Wbs", D11).X === 5, "move covers both kinds");
  ok(itemOf(rows, "Requirement", fr2.RequirementId).OnCanvas === false, "an item not on the canvas is skipped");
  const untouched = itemOf(await items(other.RequirementCanvasId), "Requirement", br.RequirementId);
  ok(untouched.X === 7 && untouched.Y === 8, "another canvas's nodes stay put");
  await move(id, [node(br.RequirementId, null, null, true)]);
  const cleared = itemOf(await items(id), "Requirement", br.RequirementId);
  ok(cleared.X === null && cleared.Y === null && cleared.IsCollapsed === true, "null clears a position");

  // Hide.
  const hide = (item, actor = PM) => exec("usp_RequirementCanvasNode_Remove", { RequirementCanvasId: id, ActorUserId: actor, ...item });
  await expectCode(50003, "a Viewer cannot hide", () => hide({ RequirementId: br.RequirementId }, VIEWER));
  await expectCode(50004, "hide with no id is refused", () => hide({}));
  await exec("usp_RequirementLink_Create", {
    RequirementId: fr.RequirementId, UpstreamRequirementId: br.RequirementId, Rationale: null, LinkStatus: "Active", ActorUserId: PM,
  });
  await hide({ RequirementId: fr.RequirementId }, CONTRIB);
  await hide({ RequirementId: fr.RequirementId });
  ok((await drawn(id)).some((l) => l.DownstreamId === fr.RequirementId && l.UpstreamId === br.RequirementId),
    "hiding keeps the item's links");
  ok(itemOf(await items(id), "Requirement", fr.RequirementId).OnCanvas === false, "hiding is repeatable");
  const kept = (await exec("usp_Requirement_GetById", { RequirementId: fr.RequirementId, ActorUserId: PM }))[0][0];
  ok(kept && kept.RequirementId === fr.RequirementId, "hiding keeps the requirement");

  // Allocate.
  await expectCode(50003, "a Viewer cannot allocate", () => allocate(fr2.RequirementId, D1, VIEWER));
  await expectCode(50004, "another project's WBS item is refused", () => allocate(fr2.RequirementId, DQ));
  await allocate(fr2.RequirementId, D1);
  ok((await wbsLinks(fr2.RequirementId)).length === 1, "allocate adds a WBS link");
  await expectCode(50004, "a live WBS link is refused", () => allocate(fr2.RequirementId, D1));
  await exec("usp_RequirementLinkRule_Set", { DownstreamType: "TR", UpstreamType: "WBS", Allowed: 0, ActorUserId: ADMIN });
  try {
    const tr = await requirement(P, "TR", "Rule gone");
    await expectCode(50004, "a removed rule refuses allocate", () => allocate(tr.RequirementId, D2));
  } finally {
    await exec("usp_RequirementLinkRule_Set", { DownstreamType: "TR", UpstreamType: "WBS", Allowed: 1, ActorUserId: ADMIN });
  }
  const tc = await requirement(P, "TC", "Test");
  await expectCode(50004, "a test case on a level 1 item is refused", () => allocate(tc.RequirementId, D1));
  await allocate(tc.RequirementId, D11);
  ok((await wbsLinks(tc.RequirementId)).length === 1, "a test case takes a level 2 item");

  const retiredWbs = (await wbsLinks(fr2.RequirementId))[0];
  await exec("usp_RequirementLink_Update", {
    RequirementId: fr2.RequirementId, UpstreamRequirementId: null, KeyDeliverableId: D1, Rationale: "keep",
    LinkStatus: "Retired", RowVer: retiredWbs.RowVer, ActorUserId: PM,
  });
  await allocate(fr2.RequirementId, D1);
  const revived = (await wbsLinks(fr2.RequirementId))[0];
  ok(revived.LinkStatus === "Active" && revived.Rationale === "keep", "a Retired link revives as Active and keeps its rationale");
  await exec("usp_RequirementLink_Update", {
    RequirementId: fr2.RequirementId, UpstreamRequirementId: null, KeyDeliverableId: D1, Rationale: "keep",
    LinkStatus: "Proposed", RowVer: revived.RowVer, ActorUserId: PM,
  });
  await allocate(fr2.RequirementId, D2);
  const both = await wbsLinks(fr2.RequirementId);
  ok(both.length === 2 && both.some((l) => l.LinkedId === D1 && l.LinkStatus === "Proposed"),
    "a Proposed link keeps its status when another WBS link lands");

  // WBS list order: WbsKey pads each part, so 10 sorts after 9 and a child sits under its parent.
  const W = await project(`canvas-w-${stamp}`);
  const tops = [];
  for (let i = 1; i <= 10; i++) tops.push(await deliverable(W, `W${i}`));
  const child = await deliverable(W, "W1 child", tops[0]);
  const listed = async (dir) =>
    (await exec("usp_KeyDeliverable_List", {
      ProjectId: W, SortBy: "Wbs", SortDir: dir, PageSize: 100, ActorUserId: PM,
    }))[0];
  const asc = await listed("asc");
  const codes = asc.map((r) => r.WbsCode).join();
  ok(codes === "1,1.1,2,3,4,5,6,7,8,9,10", `the WBS list sorts by number, got ${codes}`);
  ok(asc[1]?.KeyDeliverableId === child, "a child sits under its parent in the WBS list");
  const desc = await listed("desc");
  ok(desc.map((r) => r.KeyDeliverableId).join() === asc.map((r) => r.KeyDeliverableId).reverse().join(),
    "the WBS list sorted descending is the reverse");

  // Parallel.
  const race = await requirement(P, "FR", "Race");
  const targets = await Promise.all(["A", "B", "C", "D"].map((n) => deliverable(P, `R${n}`)));
  await Promise.all(targets.map((t) => allocate(race.RequirementId, t)));
  ok((await wbsLinks(race.RequirementId)).length === 4, "parallel allocates all land");
  const raced = await Promise.allSettled(Array.from({ length: 6 }, () => add(id, { RequirementId: race.RequirementId })));
  ok(raced.every((r) => r.status === "fulfilled"), "parallel adds all succeed");
  const nodeRows = (await items(id)).filter((r) => r.Kind === "Requirement" && r.ItemId === race.RequirementId);
  ok(nodeRows.length === 1 && nodeRows[0].OnCanvas === true, "parallel adds leave one node");

  await pool.close();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
