// Behaviour checks for dependencies between work breakdown items (migration 044, ADR-0046
// decisions 5-10). Pins, from the outside and through the procs only, the rules no constraint can
// express — no duplicate pair, no ancestor pair, no cycle, both ends in one project — and the
// scheduler itself: each of the four types at its boundary, a push carried down a chain, a summary
// moved as a branch, a milestone kept to one day, and the push-only rule (slack is never reclaimed).
// The CHECK constraints are the backstop and their text is pinned by
// src/tests/wbs-sql-guardrails.test.ts.
// Runs against the seeded database in the CI db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm)
// and locally: node db/tests/key-deliverable-dependency.cjs. Creates throwaway projects and leaves
// soft-deleted rows behind, so never point it at a real database.
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
const DAY = (iso) => new Date(`${iso}T00:00:00Z`);
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
/** The proc must refuse, and the reason must be the one named. */
async function refuses(label, reason, run) {
  try {
    await run();
    failures++;
    console.log("FAIL", `${label} (it was allowed)`);
  } catch (e) {
    const message = String(e.message || e);
    if (message.includes(reason)) passes++;
    else {
      failures++;
      console.log("FAIL", `${label} (refused with: ${message})`);
    }
  }
}
async function project(name) {
  const [[row]] = await exec("usp_Project_Create", {
    ProjectName: name, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0, Requisition: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
async function item(projectId, name, extra = {}) {
  const [[row]] = await exec("usp_KeyDeliverable_Create", {
    ProjectId: projectId, KeyRequirement: name, StartDate: DAY("2026-11-02"),
    Deadline: DAY("2026-11-13"), ActorUserId: PM, ...extra,
  });
  return row;
}
const day = (value) => (value === null ? null : new Date(value).toISOString().slice(0, 10));
/** The whole breakdown as the editor reads it, by item id. */
async function gantt(projectId) {
  const [rows] = await exec("usp_KeyDeliverable_GanttData", {
    ProjectId: projectId, ActorUserId: PM, WithProjectRow: 1,
  });
  const byId = new Map();
  for (const r of rows) if (r.KeyDeliverableId !== null) byId.set(r.KeyDeliverableId, r);
  return byId;
}
const span = (row) => `${day(row.StartDate)}..${day(row.Deadline)}`;
async function link(predecessorId, successorId, type = "FS", lagDays = 0) {
  const [[row]] = await exec("usp_KeyDeliverableDependency_Link", {
    PredecessorId: predecessorId, SuccessorId: successorId,
    DependencyType: type, LagDays: lagDays, ActorUserId: PM,
  });
  return row.DependencyId;
}
/** A dated leaf, so each case starts from a known span. */
async function leaf(projectId, name, start, end, extra = {}) {
  return item(projectId, name, { StartDate: DAY(start), Deadline: DAY(end), ...extra });
}

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const stamp = Date.now();
  const P = await project(`kdd-${stamp}`);

  // ---- the rules no constraint can express, each taken under the project lock ----

  const a = await leaf(P, `a-${stamp}`, "2026-11-02", "2026-11-06");
  const b = await leaf(P, `b-${stamp}`, "2026-11-20", "2026-11-24");
  const id = await link(a.KeyDeliverableId, b.KeyDeliverableId);
  ok(typeof id === "number" && id > 0, "two unrelated dated items can be linked");

  await refuses("linking an item to itself", "cannot depend on itself", () =>
    link(a.KeyDeliverableId, a.KeyDeliverableId),
  );
  await refuses("linking the same ordered pair twice", "already linked", () =>
    link(a.KeyDeliverableId, b.KeyDeliverableId),
  );
  await refuses("closing a loop", "loop of dependencies", () =>
    link(b.KeyDeliverableId, a.KeyDeliverableId),
  );

  const parent = await item(P, `parent-${stamp}`);
  const child = await leaf(P, `child-${stamp}`, "2026-11-02", "2026-11-04", {
    ParentKeyDeliverableId: parent.KeyDeliverableId,
  });
  await refuses("linking a summary to its own sub-item", "sub-item or summary", () =>
    link(parent.KeyDeliverableId, child.KeyDeliverableId),
  );
  await refuses("linking a sub-item to its own summary", "sub-item or summary", () =>
    link(child.KeyDeliverableId, parent.KeyDeliverableId),
  );

  const other = await project(`kdd-other-${stamp}`);
  const far = await leaf(other, `far-${stamp}`, "2026-11-02", "2026-11-04");
  await refuses("linking across two projects", "same project", () =>
    link(a.KeyDeliverableId, far.KeyDeliverableId),
  );

  await refuses("an unknown type", "Unknown dependency type", () =>
    link(a.KeyDeliverableId, child.KeyDeliverableId, "ZZ"),
  );
  await refuses("a lag past the bound", "Lag must be between", () =>
    link(a.KeyDeliverableId, child.KeyDeliverableId, "FS", 4000),
  );

  // ---- the scheduler: each type at its boundary -------------------------------

  // FS at lag 0: the successor may not start until the day after the predecessor ends.
  const Q = await project(`kdd-fs-${stamp}`);
  const p1 = await leaf(Q, `p-${stamp}`, "2026-11-02", "2026-11-06");
  const s1 = await leaf(Q, `s-${stamp}`, "2026-11-03", "2026-11-05");
  await link(p1.KeyDeliverableId, s1.KeyDeliverableId, "FS", 0);
  let rows = await gantt(Q);
  ok(span(rows.get(s1.KeyDeliverableId)) === "2026-11-07..2026-11-09",
    "FS pushes the successor to the day after its predecessor ends, keeping its length");

  // SS at lag 0: the successor may start the same day, so one already there does not move.
  const R = await project(`kdd-ss-${stamp}`);
  const p2 = await leaf(R, `p-${stamp}`, "2026-11-02", "2026-11-06");
  const s2 = await leaf(R, `s-${stamp}`, "2026-11-02", "2026-11-04");
  await link(p2.KeyDeliverableId, s2.KeyDeliverableId, "SS", 0);
  rows = await gantt(R);
  ok(span(rows.get(s2.KeyDeliverableId)) === "2026-11-02..2026-11-04",
    "SS at lag 0 lets the successor start on the same day as its predecessor");

  // FF: the successor may not finish before the predecessor does.
  const S = await project(`kdd-ff-${stamp}`);
  const p3 = await leaf(S, `p-${stamp}`, "2026-11-02", "2026-11-10");
  const s3 = await leaf(S, `s-${stamp}`, "2026-11-02", "2026-11-05");
  await link(p3.KeyDeliverableId, s3.KeyDeliverableId, "FF", 0);
  rows = await gantt(S);
  ok(span(rows.get(s3.KeyDeliverableId)) === "2026-11-07..2026-11-10",
    "FF pushes the successor until its end meets its predecessor's");

  // SF: the successor may not finish before the predecessor starts.
  const T = await project(`kdd-sf-${stamp}`);
  const p4 = await leaf(T, `p-${stamp}`, "2026-11-10", "2026-11-14");
  const s4 = await leaf(T, `s-${stamp}`, "2026-11-02", "2026-11-04");
  await link(p4.KeyDeliverableId, s4.KeyDeliverableId, "SF", 0);
  rows = await gantt(T);
  ok(span(rows.get(s4.KeyDeliverableId)) === "2026-11-08..2026-11-10",
    "SF pushes the successor until its end meets its predecessor's start");

  // A positive lag moves it further still.
  const U = await project(`kdd-lag-${stamp}`);
  const p5 = await leaf(U, `p-${stamp}`, "2026-11-02", "2026-11-06");
  const s5 = await leaf(U, `s-${stamp}`, "2026-11-03", "2026-11-05");
  await link(p5.KeyDeliverableId, s5.KeyDeliverableId, "FS", 3);
  rows = await gantt(U);
  ok(span(rows.get(s5.KeyDeliverableId)) === "2026-11-10..2026-11-12",
    "a lag of 3 days pushes the successor three days further");

  // ---- the cascade down a chain, and the push-only rule -----------------------

  const V = await project(`kdd-chain-${stamp}`);
  const c1 = await leaf(V, `c1-${stamp}`, "2026-11-02", "2026-11-04");
  const c2 = await leaf(V, `c2-${stamp}`, "2026-11-02", "2026-11-03");
  const c3 = await leaf(V, `c3-${stamp}`, "2026-11-02", "2026-11-02");
  await link(c1.KeyDeliverableId, c2.KeyDeliverableId);
  await link(c2.KeyDeliverableId, c3.KeyDeliverableId);
  rows = await gantt(V);
  ok(span(rows.get(c2.KeyDeliverableId)) === "2026-11-05..2026-11-06"
    && span(rows.get(c3.KeyDeliverableId)) === "2026-11-07..2026-11-07",
    "a link made on a chain pushes every item down it");

  // Moving the head pushes the whole chain again.
  const head = (await gantt(V)).get(c1.KeyDeliverableId);
  await exec("usp_KeyDeliverable_Reschedule", {
    KeyDeliverableId: c1.KeyDeliverableId, StartDate: DAY("2026-11-09"),
    Deadline: DAY("2026-11-11"), RowVer: head.RowVer, ActorUserId: PM,
  });
  rows = await gantt(V);
  ok(span(rows.get(c2.KeyDeliverableId)) === "2026-11-12..2026-11-13"
    && span(rows.get(c3.KeyDeliverableId)) === "2026-11-14..2026-11-14",
    "dragging the head of a chain carries the rest of it");

  // Pulling the head back leaves the chain where it is: slack is never reclaimed (decision 7).
  const headAgain = (await gantt(V)).get(c1.KeyDeliverableId);
  await exec("usp_KeyDeliverable_Reschedule", {
    KeyDeliverableId: c1.KeyDeliverableId, StartDate: DAY("2026-11-02"),
    Deadline: DAY("2026-11-04"), RowVer: headAgain.RowVer, ActorUserId: PM,
  });
  rows = await gantt(V);
  ok(span(rows.get(c2.KeyDeliverableId)) === "2026-11-12..2026-11-13",
    "moving a predecessor earlier leaves its successors where they are");

  // A bar dragged earlier than a predecessor allows is pushed back to the earliest day it may take.
  const mid = (await gantt(V)).get(c2.KeyDeliverableId);
  await exec("usp_KeyDeliverable_Reschedule", {
    KeyDeliverableId: c2.KeyDeliverableId, StartDate: DAY("2026-11-01"),
    Deadline: DAY("2026-11-02"), RowVer: mid.RowVer, ActorUserId: PM,
  });
  rows = await gantt(V);
  ok(span(rows.get(c2.KeyDeliverableId)) === "2026-11-05..2026-11-06",
    "a successor dragged too early is put back to the earliest day its link allows");

  // ---- a summary successor moves as a branch; a milestone keeps its one day ----

  const W = await project(`kdd-branch-${stamp}`);
  const driver = await leaf(W, `driver-${stamp}`, "2026-11-02", "2026-11-10");
  const phase = await item(W, `phase-${stamp}`);
  const sub1 = await leaf(W, `sub1-${stamp}`, "2026-11-02", "2026-11-05", {
    ParentKeyDeliverableId: phase.KeyDeliverableId,
  });
  const sub2 = await leaf(W, `sub2-${stamp}`, "2026-11-06", "2026-11-08", {
    ParentKeyDeliverableId: phase.KeyDeliverableId,
  });
  await link(driver.KeyDeliverableId, phase.KeyDeliverableId);
  rows = await gantt(W);
  ok(span(rows.get(sub1.KeyDeliverableId)) === "2026-11-11..2026-11-14"
    && span(rows.get(sub2.KeyDeliverableId)) === "2026-11-15..2026-11-17",
    "a summary successor moves as a whole branch, keeping its shape");
  ok(span(rows.get(phase.KeyDeliverableId)) === "2026-11-11..2026-11-17",
    "and its own span is rolled up from where its sub-items landed");

  const X = await project(`kdd-ms-${stamp}`);
  const before = await leaf(X, `before-${stamp}`, "2026-11-02", "2026-11-06");
  const gate = await leaf(X, `gate-${stamp}`, "2026-11-03", "2026-11-03", { IsMilestone: true });
  await link(before.KeyDeliverableId, gate.KeyDeliverableId);
  rows = await gantt(X);
  ok(span(rows.get(gate.KeyDeliverableId)) === "2026-11-07..2026-11-07",
    "a pushed milestone keeps its one day");

  // ---- an undated end cannot be reached through the procs --------------------
  // The scheduler refuses to date an undated successor (it requires StartDate and Deadline to be
  // NOT NULL both when it collects a shift and when it writes one), but that guard cannot be
  // exercised from here: usp_KeyDeliverable_Create fills a missing @StartDate with @RequestedDate
  // or today for callers from before migration 032, and usp_KeyDeliverable_Update coalesces to the
  // row's current value, so no proc leaves a live row undated. This connection is the EXECUTE-only
  // pm_web login (ADR-0033) and cannot null the columns with a query. What is pinned instead is the
  // reachable truth: an item sent no dates comes back dated, so the NULL guard protects legacy rows
  // only and must not be read as a live code path.

  const Y = await project(`kdd-undated-${stamp}`);
  const dated = await leaf(Y, `dated-${stamp}`, "2026-11-02", "2026-11-06");
  const undated = await item(Y, `undated-${stamp}`, { StartDate: null, Deadline: null });
  await link(dated.KeyDeliverableId, undated.KeyDeliverableId);
  rows = await gantt(Y);
  ok(rows.get(undated.KeyDeliverableId).StartDate !== null,
    "an item created with no dates is dated by Create, so an undated successor is unreachable");

  // ---- the link itself: retype, unlink, concurrency, and the read back --------

  const Z = await project(`kdd-link-${stamp}`);
  const z1 = await leaf(Z, `z1-${stamp}`, "2026-11-02", "2026-11-06");
  const z2 = await leaf(Z, `z2-${stamp}`, "2026-11-20", "2026-11-22");
  const zid = await link(z1.KeyDeliverableId, z2.KeyDeliverableId, "FS", 0);
  rows = await gantt(Z);
  const carried = JSON.parse(rows.get(z2.KeyDeliverableId).PredecessorsJson);
  ok(carried.length === 1 && carried[0].id === zid
    && carried[0].predecessorId === z1.KeyDeliverableId
    && carried[0].type === "FS" && carried[0].lagDays === 0,
    "the link comes back on its successor's row, with its type, lag and RowVer");
  ok(carried[0].rowVer > 0, "and with a RowVer to save against");
  ok(rows.get(z1.KeyDeliverableId).PredecessorsJson === null,
    "a row that is nobody's successor carries no links");

  await exec("usp_KeyDeliverableDependency_Relink", {
    DependencyId: zid, DependencyType: "SS", LagDays: 2, RowVer: carried[0].rowVer,
    ActorUserId: PM,
  });
  rows = await gantt(Z);
  const retyped = JSON.parse(rows.get(z2.KeyDeliverableId).PredecessorsJson)[0];
  ok(retyped.type === "SS" && retyped.lagDays === 2, "a link can be retyped and re-lagged");

  await refuses("retyping against a stale RowVer", "modified by someone else", () =>
    exec("usp_KeyDeliverableDependency_Relink", {
      DependencyId: zid, DependencyType: "FF", LagDays: 0, RowVer: carried[0].rowVer,
      ActorUserId: PM,
    }),
  );

  // Setting a link to what it already is writes nothing, so a replayed save is not a conflict.
  await exec("usp_KeyDeliverableDependency_Relink", {
    DependencyId: zid, DependencyType: "SS", LagDays: 2, RowVer: retyped.rowVer, ActorUserId: PM,
  });
  await exec("usp_KeyDeliverableDependency_Relink", {
    DependencyId: zid, DependencyType: "SS", LagDays: 2, RowVer: retyped.rowVer, ActorUserId: PM,
  });
  passes++;

  await exec("usp_KeyDeliverableDependency_Unlink", {
    DependencyId: zid, RowVer: retyped.rowVer, ActorUserId: PM,
  });
  rows = await gantt(Z);
  ok(rows.get(z2.KeyDeliverableId).PredecessorsJson === null, "an unlinked pair carries no link");
  // The pair can be linked again: the unique index is filtered on IsDeleted = 0.
  const again = await link(z1.KeyDeliverableId, z2.KeyDeliverableId);
  ok(again > zid, "and the same pair can be linked again after an unlink");

  // ---- a deleted item takes its links with it, at either end ------------------

  const z3 = await leaf(Z, `z3-${stamp}`, "2026-12-01", "2026-12-03");
  await link(z2.KeyDeliverableId, z3.KeyDeliverableId);
  const doomed = (await gantt(Z)).get(z2.KeyDeliverableId);
  await exec("usp_KeyDeliverable_Delete", {
    KeyDeliverableId: z2.KeyDeliverableId, RowVer: doomed.RowVer, ActorUserId: PM,
  });
  rows = await gantt(Z);
  ok(!rows.has(z2.KeyDeliverableId), "the deleted item is gone from the breakdown");
  ok(rows.get(z3.KeyDeliverableId).PredecessorsJson === null,
    "and the links at both of its ends went with it");

  // The freshness stamp moves when only a link changes, so a refresh cannot restore stale arrows.
  const w1 = await leaf(Z, `w1-${stamp}`, "2027-01-04", "2027-01-06");
  const w2 = await leaf(Z, `w2-${stamp}`, "2027-02-01", "2027-02-03");
  const [beforeRows] = await exec("usp_KeyDeliverable_GanttData", {
    ProjectId: Z, ActorUserId: PM, WithProjectRow: 1,
  });
  await link(w1.KeyDeliverableId, w2.KeyDeliverableId);
  const [afterRows] = await exec("usp_KeyDeliverable_GanttData", {
    ProjectId: Z, ActorUserId: PM, WithProjectRow: 1,
  });
  ok(Number(afterRows[0].Stamp) > Number(beforeRows[0].Stamp),
    "linking two items moves the Gantt freshness stamp");

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
