// Behaviour checks for recurring to-dos (ADR-0059): the rule procs, one occurrence's own row, and
// the calendar read. A rule has no RowVer of its own, so its writes must check and move the
// to-do's; an occurrence row has its own, so marking one done must leave the series' alone. A
// change of pattern deletes only future occurrence rows, and the calendar shows only what the
// to-do rule lets the actor read.
//
// Runs against the seeded database in the CI db-apply job (E2E_SEED=1: users 1 admin,
// 3 e2e-pm, 5 e2e-viewer) and locally: node db/tests/todo-recurrence-procs.cjs. Leaves to-dos
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

// Calendar days relative to today (UTC), as "YYYY-MM-DD".
const today = new Date();
const day = (n) =>
  new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + n))
    .toISOString()
    .slice(0, 10);
const at = (n) => `${day(n)}T00:00:00`;
const sameInstant = (d, n) => d instanceof Date && d.toISOString().slice(0, 10) === day(n);

const DAILY = { RepeatUnit: "Day", RepeatEvery: 1 };
const createTodo = async (actor, startDay, label) =>
  (await exec("usp_TodoItem_Create", {
    TodoItem: `recurrence ${label} ${Date.now()}`, StartDate: startDay === null ? null : day(startDay),
    ActorUserId: actor,
  }))[0][0];
const setRule = async (todo, rule, actor = OWNER, rowVer = todo.RowVer) =>
  (await exec("usp_TodoRecurrence_Set", {
    TodoItemId: todo.TodoItemId, ...rule, RowVer: rowVer, ActorUserId: actor,
    LocalNow: new Date(),
  }))[0][0];
const clearRule = async (todo, actor = OWNER, rowVer = todo.RowVer) =>
  (await exec("usp_TodoRecurrence_Clear", {
    TodoItemId: todo.TodoItemId, RowVer: rowVer, ActorUserId: actor,
  }))[0][0];
const readRule = async (todo, actor = OWNER) =>
  (await exec("usp_TodoRecurrence_GetById", {
    TodoItemId: todo.TodoItemId, ActorUserId: actor,
  }))[0][0];
const setOccurrence = async (todo, n, change, actor = OWNER) =>
  (await exec("usp_TodoOccurrence_Set", {
    TodoItemId: todo.TodoItemId, OccursAt: at(n), ActorUserId: actor, ...change,
  }))[0][0];
const calendar = async (from, to, actor = OWNER) =>
  exec("usp_Todo_ListCalendar", { ActorUserId: actor, From: day(from), To: day(to) });
const rowVerOf = async (todo) =>
  (await exec("usp_TodoItem_GetById", { TodoItemId: todo.TodoItemId, ActorUserId: OWNER }))[0][0]
    .RowVer;
const lastAudit = async (entity, id) => {
  const [page] = await exec("usp_Audit_List", { ActorUserId: ADMIN, Search: entity, PageSize: 100 });
  const row = page.find((r) => r.EntityName === entity && String(r.EntityId) === String(id));
  return row && (await exec("usp_Audit_GetById", { AuditLogId: row.AuditLogId, ActorUserId: ADMIN }))[0][0];
};

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });

  // ---- a rule's fields are checked per unit, before the CHECKs ----------------------------------
  const todo = await createTodo(OWNER, -10, "series");
  const bad = [
    ["an unknown unit", { RepeatUnit: "Year", RepeatEvery: 1 }],
    ["every 0", { RepeatUnit: "Day", RepeatEvery: 0 }],
    ["every 1000", { RepeatUnit: "Day", RepeatEvery: 1000 }],
    ["an hourly rule without a start time", { RepeatUnit: "Hour", RepeatEvery: 1 }],
    ["a daily rule with a start time", { ...DAILY, StartTime: "09:00:00" }],
    ["a weekly rule without days", { RepeatUnit: "Week", RepeatEvery: 1 }],
    ["a weekly rule with day mask 128", { RepeatUnit: "Week", RepeatEvery: 1, Weekdays: 128 }],
    ["a daily rule with days", { ...DAILY, Weekdays: 1 }],
    ["a monthly rule without a mode", { RepeatUnit: "Month", RepeatEvery: 1 }],
    ["an Nth weekday without an ordinal", { RepeatUnit: "Month", RepeatEvery: 1, MonthMode: "NthWeekday", Weekday: 2 }],
    ["ordinal 5", { RepeatUnit: "Month", RepeatEvery: 1, MonthMode: "NthWeekday", Ordinal: 5, Weekday: 2 }],
    ["a daily rule with an ordinal", { ...DAILY, Ordinal: 1, Weekday: 2 }],
    ["both endings", { ...DAILY, EndsOn: day(30), EndsAfter: 5 }],
    ["ending after 0 times", { ...DAILY, EndsAfter: 0 }],
    ["ending before the start", { ...DAILY, EndsOn: day(-11) }],
  ];
  for (const [label, rule] of bad)
    await expectCode(50004, `${label} is refused`, () => setRule(todo, rule));
  const undated = await createTodo(OWNER, null, "undated");
  await expectCode(50004, "a to-do without a start date cannot repeat", () => setRule(undated, DAILY));
  await expectCode(50003, "another user cannot set the rule", () => setRule(todo, DAILY, OTHER));

  // ---- the to-do's RowVer is the rule's one token -----------------------------------------------
  const rule = await setRule(todo, DAILY);
  ok(rule.RepeatUnit === "Day" && rule.RepeatEvery === 1, "a first rule is stored");
  ok(String(rule.RowVer) !== String(todo.RowVer), "setting a rule moves the to-do's RowVer");
  ok((await lastAudit("app.TodoRecurrence", todo.TodoItemId)).Action === "Create", "a first rule audits Create");
  await expectCode(50002, "a stale to-do RowVer conflicts", () => setRule(todo, DAILY));
  const read = await readRule(todo);
  ok(read?.RepeatUnit === "Day" && String(read.RowVer) === String(rule.RowVer), "the rule reads back with the to-do's RowVer");
  ok((await readRule(undated)) === undefined, "a to-do that does not repeat reads no rule");
  await expectCode(50003, "another user cannot read the rule", () => readRule(todo, OTHER));
  let rowVer = rule.RowVer;

  // ---- one occurrence's own row ---------------------------------------------------------------
  await expectCode(50004, "an occurrence before the start is refused", () =>
    setOccurrence(todo, -11, { Status: "In Progress" }));
  await expectCode(50004, "a skipped occurrence with a status is refused", () =>
    setOccurrence(todo, -5, { IsSkipped: true, Status: "In Progress" }));
  await expectCode(50004, "a status outside the list is refused", () =>
    setOccurrence(todo, -5, { Status: "Not a status" }));
  await expectCode(50003, "another user cannot change an occurrence", () =>
    setOccurrence(todo, -5, { Status: "In Progress" }, OTHER));
  await expectCode(50002, "a RowVer for an occurrence with no row conflicts", () =>
    setOccurrence(todo, -5, { Status: "In Progress", RowVer: "1" }));

  const past = await setOccurrence(todo, -5, { Status: "In Progress" });
  ok(past && sameInstant(past.OccursAt, -5) && past.Status === "In Progress", "a first change creates the row");
  ok(String(await rowVerOf(todo)) === String(rowVer), "an occurrence write leaves the series' RowVer alone");
  await expectCode(50002, "a missing RowVer on an existing row conflicts", () =>
    setOccurrence(todo, -5, { IsSkipped: true }));
  const skipped = await setOccurrence(todo, -5, { IsSkipped: true, RowVer: past.RowVer });
  ok(skipped.IsSkipped === true && skipped.Status === null, "the row is updated");
  await expectCode(50002, "a stale occurrence RowVer conflicts", () =>
    setOccurrence(todo, -5, { IsSkipped: true, RowVer: past.RowVer }));
  const cleared = await setOccurrence(todo, -5, { RowVer: skipped.RowVer });
  ok(cleared === undefined, "clearing every change deletes the row");
  ok((await lastAudit("app.TodoOccurrence", skipped.TodoOccurrenceId)).Action === "Delete", "the delete is audited");

  await setOccurrence(todo, -3, { Status: "In Progress" });
  const moved = await setOccurrence(todo, 20, { MovedTo: at(22) });
  ok(moved && sameInstant(moved.MovedTo, 22), "an occurrence can be moved");

  // ---- the calendar -----------------------------------------------------------------------------
  await expectCode(50004, "a 63-day window is refused", () => calendar(0, 62));
  await expectCode(50004, "a window that ends before it starts is refused", () => calendar(1, 0));
  const oneOff = await createTodo(OWNER, 2, "one-off");
  const outside = await createTodo(OWNER, 40, "outside");
  const [todos, occurrences] = await calendar(-6, 25);
  const ids = todos.map((t) => t.TodoItemId);
  ok(ids.includes(todo.TodoItemId) && ids.includes(oneOff.TodoItemId), "the series and the one-off show");
  ok(!ids.includes(outside.TodoItemId), "a one-off outside the window does not");
  ok(todos.find((t) => t.TodoItemId === oneOff.TodoItemId).RepeatUnit === null, "a one-off has no rule");
  ok(todos.find((t) => t.TodoItemId === todo.TodoItemId).RepeatUnit === "Day", "a series carries its rule");
  ok(occurrences.filter((o) => o.TodoItemId === todo.TodoItemId).length === 2, "both occurrence rows show");
  const [othersView] = await calendar(-6, 25, OTHER);
  ok(!othersView.some((t) => t.TodoItemId === todo.TodoItemId), "another user's to-do is hidden");
  const [adminView] = await calendar(-6, 25, ADMIN);
  ok(adminView.some((t) => t.TodoItemId === todo.TodoItemId), "an Admin sees it");

  // ---- changing the rule ------------------------------------------------------------------------
  const ending = await setRule(todo, { ...DAILY, EndsOn: day(20) }, OWNER, rowVer);
  const [, keptRows] = await calendar(-6, 25);
  ok(keptRows.filter((o) => o.TodoItemId === todo.TodoItemId).length === 2, "changing only the ending keeps every row");
  const [movedIn] = await calendar(21, 23);
  ok(movedIn.some((t) => t.TodoItemId === todo.TodoItemId), "an ended series shows where an occurrence moved to");
  const weekly = await setRule(todo, { RepeatUnit: "Week", RepeatEvery: 1, Weekdays: 127 }, OWNER, ending.RowVer);
  const [, afterRows] = await calendar(-6, 25);
  const left = afterRows.filter((o) => o.TodoItemId === todo.TodoItemId);
  ok(left.length === 1 && sameInstant(left[0].OccursAt, -3), "a pattern change deletes only future rows");
  const audit = await lastAudit("app.TodoRecurrence", todo.TodoItemId);
  ok(JSON.parse(audit.BeforeJson).RemovedOccurrences?.length === 1, "the deleted rows go into the audit");
  await expectCode(50002, "an occurrence removed with the pattern conflicts on its old RowVer", () =>
    setOccurrence(todo, 20, { MovedTo: at(23), RowVer: moved.RowVer }));

  // ---- clearing the rule ------------------------------------------------------------------------
  await expectCode(50003, "another user cannot clear the rule", () => clearRule(todo, OTHER, weekly.RowVer));
  const one = await clearRule(todo, OWNER, weekly.RowVer);
  ok(String(one.RowVer) !== String(weekly.RowVer), "clearing moves the to-do's RowVer");
  ok((await lastAudit("app.TodoRecurrence", todo.TodoItemId)).Action === "Delete", "clearing is audited");
  ok((await readRule(todo)) === undefined, "a cleared rule reads no row");
  const [afterClear] = await calendar(-6, 25);
  ok(!afterClear.some((t) => t.TodoItemId === todo.TodoItemId), "a cleared to-do is a one-off again, outside the window by its start");
  await expectCode(50004, "an occurrence of a to-do that no longer repeats is refused", () =>
    setOccurrence(todo, -3, { Status: "In Progress" }));
  const again = await clearRule({ ...todo, RowVer: one.RowVer });
  ok(String(again.RowVer) !== String(one.RowVer), "clearing a to-do with no rule only moves its RowVer");

  // ---- a series' start date ---------------------------------------------------------------------
  const series = await createTodo(OWNER, -10, "start date");
  const seriesRule = await setRule(series, DAILY);
  await setOccurrence(series, -3, { Status: "In Progress" });
  await setOccurrence(series, 5, { Status: "In Progress" });
  const updateStart = (startDay, rowVer) =>
    exec("usp_TodoItem_Update", {
      TodoItemId: series.TodoItemId, TodoItem: series.TodoItem,
      StartDate: startDay === null ? null : day(startDay), RowVer: rowVer, ActorUserId: OWNER,
      LocalNow: new Date(),
    });
  await expectCode(50004, "a repeating to-do cannot lose its start date", () =>
    updateStart(null, seriesRule.RowVer));
  await updateStart(-9, seriesRule.RowVer);
  const [, shifted] = await calendar(-10, 10);
  const stayed = shifted.filter((o) => o.TodoItemId === series.TodoItemId);
  ok(stayed.length === 1 && sameInstant(stayed[0].OccursAt, -3), "moving the start date deletes only future rows");
  const moveAudit = await lastAudit("app.TodoItem", series.TodoItemId);
  ok(JSON.parse(moveAudit.BeforeJson).RemovedOccurrences?.length === 1, "the deleted rows go into the to-do's audit");

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
