// Behaviour checks for the planner slot (migration 082): a to-do placed at a time of day. Placing,
// moving and clearing the slot go through usp_TodoItem_Schedule only, never the to-do's dates; a
// stale RowVer is refused; a slot must end after it starts and by the next midnight; the planner
// read shows only placed to-dos the actor may read, in a window of at most 31 days.
//
// Runs against the seeded database in the CI db-apply job (E2E_SEED=1: users 1 admin,
// 3 e2e-pm, 5 e2e-viewer) and locally: node db/tests/todo-schedule-procs.cjs. Leaves to-dos
// behind, so never point it at a real database.
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (DB_NAME must be set; .env fills the rest).
require("./support/test-env.cjs");
const sql = require("mssql");

const ADMIN = 1;
const OWNER = 3;
const OTHER = 5;
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

const today = new Date();
const day = (n) =>
  new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + n))
    .toISOString()
    .slice(0, 10);
const clock = (n, hhmm) => new Date(`${day(n)}T${hhmm}:00Z`);
const wall = (d) => (d instanceof Date ? d.toISOString().slice(0, 16) : null);

const schedule = (todo, start, end, actor = OWNER, rowVer = todo.RowVer) =>
  exec("usp_TodoItem_Schedule", {
    TodoItemId: todo.TodoItemId, ScheduledStart: start, ScheduledEnd: end, RowVer: rowVer,
    ActorUserId: actor,
  }).then(([rows]) => rows[0]);
const planner = (from, to, actor = OWNER) =>
  exec("usp_Todo_ListSchedule", { ActorUserId: actor, From: day(from), To: day(to) }).then(([rows]) => rows);
const lastAudit = async (entity, id) => {
  const [page] = await exec("usp_Audit_List", { ActorUserId: ADMIN, Search: entity, PageSize: 100 });
  const row = page.find((r) => r.EntityName === entity && String(r.EntityId) === String(id));
  return row && (await exec("usp_Audit_GetById", { AuditLogId: row.AuditLogId, ActorUserId: ADMIN }))[0][0];
};

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });

  // ---- a typed entry: a new to-do that holds its slot ---------------------------------------------
  const [[typed]] = await exec("usp_TodoItem_Create", {
    TodoItem: `planner typed ${Date.now()}`, StartDate: day(1),
    ScheduledStart: clock(1, "14:00"), ScheduledEnd: clock(1, "15:00"), ActorUserId: OWNER,
  });
  ok(wall(typed.ScheduledStart) === `${day(1)}T14:00` && wall(typed.ScheduledEnd) === `${day(1)}T15:00`,
    "create returns the typed slot");
  await expectCode(50004, "create refuses half a slot", () =>
    exec("usp_TodoItem_Create", {
      TodoItem: `planner half ${Date.now()}`, ScheduledStart: clock(1, "09:00"), ScheduledEnd: null,
      ActorUserId: OWNER,
    }));

  // ---- dragging an existing to-do on, moving it, stretching it -----------------------------------
  const [[todo]] = await exec("usp_TodoItem_Create", {
    TodoItem: `planner drag ${Date.now()}`, StartDate: day(5), DueDate: day(9), ActorUserId: OWNER,
  });
  ok(!(await planner(0, 9)).some((r) => r.TodoItemId === todo.TodoItemId),
    "a dated to-do without a slot stays off the planner");
  const placed = await schedule(todo, clock(2, "08:30"), clock(2, "08:42"));
  ok(wall(placed.ScheduledStart) === `${day(2)}T08:30` && wall(placed.ScheduledEnd) === `${day(2)}T08:42`,
    "exact minutes are kept");
  const [[afterPlace]] = await exec("usp_TodoItem_GetById", { TodoItemId: todo.TodoItemId, ActorUserId: OWNER });
  ok(wall(afterPlace.StartDate) === `${day(5)}T00:00` && wall(afterPlace.DueDate) === `${day(9)}T00:00`,
    "placing a to-do leaves its dates alone");
  ok(String((await lastAudit("app.TodoItem", todo.TodoItemId))?.AfterJson).includes("ScheduledStart"),
    "the slot change is audited");

  await expectCode(50002, "a stale RowVer is refused", () =>
    schedule(todo, clock(2, "10:00"), clock(2, "11:00"), OWNER, todo.RowVer));
  await expectCode(50003, "another user cannot place someone's personal to-do", () =>
    schedule(todo, clock(2, "10:00"), clock(2, "11:00"), OTHER, placed.RowVer));

  const bad = [
    ["an end before the start", clock(2, "11:00"), clock(2, "10:00")],
    ["an end equal to the start", clock(2, "11:00"), clock(2, "11:00")],
    ["an end past midnight", clock(2, "23:00"), clock(3, "00:15")],
    ["half a slot", clock(2, "11:00"), null],
  ];
  for (const [label, start, end] of bad)
    await expectCode(50004, `${label} is refused`, () => schedule(todo, start, end, OWNER, placed.RowVer));
  const toMidnight = await schedule(todo, clock(2, "23:00"), clock(3, "00:00"), OWNER, placed.RowVer);
  ok(wall(toMidnight.ScheduledEnd) === `${day(3)}T00:00`, "a slot may end at the next midnight");

  // ---- the planner read ---------------------------------------------------------------------------
  const window = await planner(0, 2);
  ok(window.some((r) => r.TodoItemId === todo.TodoItemId) && window.some((r) => r.TodoItemId === typed.TodoItemId),
    "the planner shows placed to-dos in the window");
  ok(!(await planner(3, 5)).some((r) => r.TodoItemId === todo.TodoItemId),
    "a slot shows on the day it starts only");
  ok(!(await planner(0, 2, OTHER)).some((r) => r.TodoItemId === todo.TodoItemId),
    "another user does not see someone's personal slot");
  await expectCode(50004, "a window over 31 days is refused", () => planner(0, 31));
  await expectCode(50004, "a window that ends before it starts is refused", () => planner(2, 0));

  // ---- the to-do panel: unplaced only, newest first, filtered before the page ---------------------
  const [[spare]] = await exec("usp_TodoItem_Create", {
    TodoItem: `planner spare ${Date.now()}`, ActorUserId: OWNER,
  });
  const panel = async (extra = { Unscheduled: true, SortBy: "TodoItemId", SortDir: "desc" }) =>
    (await exec("usp_TodoItem_List", { ActorUserId: OWNER, PageSize: 100, ...extra }))[0].map((r) => r.TodoItemId);
  const unplaced = await panel();
  ok(unplaced.includes(spare.TodoItemId), "the panel lists a new unplaced to-do");
  ok(unplaced.every((id, i) => i === 0 || unplaced[i - 1] > id), "the panel lists the newest first");
  ok(!unplaced.includes(todo.TodoItemId) && !unplaced.includes(typed.TodoItemId), "the panel leaves out placed to-dos");
  const everything = await panel({});
  ok(everything.every((id, i) => i === 0 || everything[i - 1] < id), "the default order stays oldest first");

  // ---- taking it off the planner keeps the to-do ---------------------------------------------------
  const cleared = await schedule(todo, null, null, OWNER, toMidnight.RowVer);
  ok(cleared.ScheduledStart === null && cleared.ScheduledEnd === null, "clearing removes the slot");
  ok(!(await planner(0, 2)).some((r) => r.TodoItemId === todo.TodoItemId), "a cleared to-do leaves the planner");
  ok((await panel()).includes(todo.TodoItemId), "a cleared to-do goes back to the panel");
  const [[stillThere]] = await exec("usp_TodoItem_GetById", { TodoItemId: todo.TodoItemId, ActorUserId: OWNER });
  ok(stillThere && stillThere.IsDeleted !== true, "the to-do itself stays");

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
