// Behaviour checks for a milestone in the work breakdown (migration 043, ADR-0046): a date rather
// than a span. Pins the two halves of the invariant from the outside, through the procs only —
// one day (the CHECK is the backstop, and its text is pinned by
// src/tests/wbs-sql-guardrails.test.ts) and no sub-items (an aggregate rule taken under the
// project lock, so no CHECK can hold it). Also pins which paths may change the flag: Create and
// SetMilestone, never an Update, so a details-sheet save cannot convert an item.
// Runs against the seeded database in the CI db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm)
// and locally: node db/tests/key-deliverable-milestone.cjs. Creates throwaway projects and leaves
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
/** One item as the breakdown the editor reads reports it. */
async function onGantt(projectId, id) {
  const [rows] = await exec("usp_KeyDeliverable_GanttData", {
    ProjectId: projectId, ActorUserId: PM, WithProjectRow: 1,
  });
  return rows.find((r) => r.KeyDeliverableId === id);
}

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const stamp = Date.now();
  const P = await project(`kdm-${stamp}`);

  // An ordinary item is a task: nothing becomes a milestone by omission.
  const task = await item(P, `task-${stamp}`);
  ok(task.IsMilestone === false, "an item created without the flag is a task");

  // Created as the date it already is.
  const born = await item(P, `born-${stamp}`, {
    StartDate: DAY("2026-11-12"), Deadline: DAY("2026-11-12"), IsMilestone: true,
  });
  ok(born.IsMilestone === true, "an item can be created as a milestone");
  ok(day(born.StartDate) === "2026-11-12" && day(born.Deadline) === "2026-11-12",
    "a new milestone's two ends are its one day");
  const bornOnGantt = await onGantt(P, born.KeyDeliverableId);
  ok(bornOnGantt && bornOnGantt.IsMilestone === true, "the breakdown the editor reads says so too");

  // Created with a span: refused rather than silently reinterpreted.
  await refuses("creating a milestone with a span", "A milestone spans one day", () =>
    item(P, `spanned-${stamp}`, {
      StartDate: DAY("2026-11-02"), Deadline: DAY("2026-11-13"), IsMilestone: true,
    }),
  );

  // Converting a dated leaf collapses the span to its start date.
  const [[turned]] = await exec("usp_KeyDeliverable_SetMilestone", {
    KeyDeliverableId: task.KeyDeliverableId, IsMilestone: true, RowVer: task.RowVer, ActorUserId: PM,
  });
  ok(turned && turned.ProjectId === P, "SetMilestone returns the item's project");
  let row = await onGantt(P, task.KeyDeliverableId);
  ok(row && row.IsMilestone === true, "a task can become a milestone");
  ok(row && day(row.StartDate) === "2026-11-02" && day(row.Deadline) === "2026-11-02",
    "turning it on collapses the span to the start date");

  // Asking for the state it is already in writes nothing and is not an error.
  const [[again]] = await exec("usp_KeyDeliverable_SetMilestone", {
    KeyDeliverableId: task.KeyDeliverableId, IsMilestone: true, RowVer: row.RowVer, ActorUserId: PM,
  });
  ok(again && again.ProjectId === P, "setting the state it already has is idempotent");
  const unchanged = await onGantt(P, task.KeyDeliverableId);
  ok(String(unchanged.RowVer) === String(row.RowVer), "and it does not touch the row");

  // A milestone moves; it never gains a length.
  await exec("usp_KeyDeliverable_Reschedule", {
    KeyDeliverableId: task.KeyDeliverableId, StartDate: DAY("2026-11-20"),
    Deadline: DAY("2026-11-20"), RowVer: unchanged.RowVer, ActorUserId: PM,
  });
  row = await onGantt(P, task.KeyDeliverableId);
  ok(day(row.StartDate) === "2026-11-20" && day(row.Deadline) === "2026-11-20",
    "a milestone can be dragged to another day");
  await refuses("stretching a milestone", "can be moved, not stretched", () =>
    exec("usp_KeyDeliverable_Reschedule", {
      KeyDeliverableId: task.KeyDeliverableId, StartDate: DAY("2026-11-20"),
      Deadline: DAY("2026-11-27"), RowVer: row.RowVer, ActorUserId: PM,
    }),
  );

  // The details sheet sends one date: a deadline of its own is ignored, not obeyed.
  await exec("usp_KeyDeliverable_Update", {
    KeyDeliverableId: task.KeyDeliverableId, KeyRequirement: `renamed-${stamp}`,
    StartDate: DAY("2026-11-23"), Deadline: DAY("2026-12-24"),
    RowVer: row.RowVer, ActorUserId: PM,
  });
  row = await onGantt(P, task.KeyDeliverableId);
  ok(day(row.StartDate) === "2026-11-23" && day(row.Deadline) === "2026-11-23",
    "an update derives a milestone's end from its start, keeping the one day");
  ok(row.IsMilestone === true, "and an update cannot turn a milestone back into a task");

  // No item sits under a milestone, either way round.
  await refuses("adding a sub-item under a milestone", "takes no sub-items", () =>
    item(P, `under-${stamp}`, {
      ParentKeyDeliverableId: task.KeyDeliverableId,
      StartDate: DAY("2026-11-23"), Deadline: DAY("2026-11-24"),
    }),
  );
  const parent = await item(P, `parent-${stamp}`);
  const child = await item(P, `child-${stamp}`, {
    ParentKeyDeliverableId: parent.KeyDeliverableId,
    StartDate: DAY("2026-11-02"), Deadline: DAY("2026-11-05"),
  });
  const parentNow = await onGantt(P, parent.KeyDeliverableId);
  await refuses("turning a parent into a milestone", "An item with sub-items cannot become", () =>
    exec("usp_KeyDeliverable_SetMilestone", {
      KeyDeliverableId: parent.KeyDeliverableId, IsMilestone: true,
      RowVer: parentNow.RowVer, ActorUserId: PM,
    }),
  );
  await refuses("moving an item under a milestone", "takes no sub-items", () =>
    exec("usp_KeyDeliverable_Move", {
      KeyDeliverableId: child.KeyDeliverableId,
      ParentKeyDeliverableId: task.KeyDeliverableId, Position: 1,
      RowVer: child.RowVer, ActorUserId: PM,
    }),
  );

  // Turning it back keeps the one day, so the person widens it afterwards.
  const beforeBack = await onGantt(P, born.KeyDeliverableId);
  await exec("usp_KeyDeliverable_SetMilestone", {
    KeyDeliverableId: born.KeyDeliverableId, IsMilestone: false,
    RowVer: beforeBack.RowVer, ActorUserId: PM,
  });
  const back = await onGantt(P, born.KeyDeliverableId);
  ok(back.IsMilestone === false, "a milestone can become a task again");
  ok(day(back.StartDate) === "2026-11-12" && day(back.Deadline) === "2026-11-12",
    "turning it off keeps the one day as both ends");
  await exec("usp_KeyDeliverable_Reschedule", {
    KeyDeliverableId: born.KeyDeliverableId, StartDate: DAY("2026-11-12"),
    Deadline: DAY("2026-11-19"), RowVer: back.RowVer, ActorUserId: PM,
  });
  const widened = await onGantt(P, born.KeyDeliverableId);
  ok(day(widened.Deadline) === "2026-11-19", "and it can be stretched once it is a task");

  // A stale RowVer is a conflict, as on every other write to the item.
  await refuses("converting against a stale RowVer", "modified by someone else", () =>
    exec("usp_KeyDeliverable_SetMilestone", {
      KeyDeliverableId: born.KeyDeliverableId, IsMilestone: true,
      RowVer: back.RowVer, ActorUserId: PM,
    }),
  );

  // A milestone contributes its one day to its parents, exactly as a one-day task does.
  const phase = await item(P, `phase-${stamp}`);
  const leaf = await item(P, `leaf-${stamp}`, {
    ParentKeyDeliverableId: phase.KeyDeliverableId,
    StartDate: DAY("2026-11-02"), Deadline: DAY("2026-11-04"),
  });
  const gate = await item(P, `gate-${stamp}`, {
    ParentKeyDeliverableId: phase.KeyDeliverableId,
    StartDate: DAY("2026-11-10"), Deadline: DAY("2026-11-18"),
  });
  const gateNow = await onGantt(P, gate.KeyDeliverableId);
  await exec("usp_KeyDeliverable_SetMilestone", {
    KeyDeliverableId: gate.KeyDeliverableId, IsMilestone: true,
    RowVer: gateNow.RowVer, ActorUserId: PM,
  });
  const phaseNow = await onGantt(P, phase.KeyDeliverableId);
  ok(day(phaseNow.StartDate) === "2026-11-02" && day(phaseNow.Deadline) === "2026-11-10",
    "the parent's span is rolled up to the milestone's day");
  ok(leaf && phaseNow, "the branch is intact");

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
