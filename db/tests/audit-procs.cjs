// Behaviour checks for Settings > Audit log: only an active Admin reads it. Both audit procs refuse
// a User, a NULL actor and a deactivated Admin, and GetById refuses before it looks the id up, so
// an id tells a non-Admin nothing. An Admin's list is paged with a TotalCount on every row, newest
// first unless asked oldest first, carries no JSON, and searches a "%" literally; GetById returns
// both sides of one entry and NOT_FOUND for an unknown id. Runs against the seeded database in the
// CI db-apply job (user 1 = admin) and locally: node db/tests/audit-procs.cjs. Creates throwaway
// accounts and leaves them deactivated, so never point it at a real database.
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (DB_NAME must be set; .env fills the rest).
require("./support/test-env.cjs");
const sql = require("mssql");

const ADMIN = 1;
// Larger than any id a test database reaches, and still an INT for the driver.
const UNKNOWN_ID = 2147483647;
// Not a password hash: the procs only require a value, and these accounts never sign in.
const PLACEHOLDER_HASH = "placeholder-not-a-hash";
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
async function expectCode(code, label, fn, text) {
  try {
    await fn();
    ok(false, `${label}: expected ${code}, got success`);
  } catch (e) {
    ok(e.number === code && (!text || e.message.includes(text)),
      `${label}: expected ${code}${text ? ` "${text}"` : ""}, got ${e.number} ${e.message}`);
  }
}

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const [roles] = await exec("usp_Role_List", {});
  const ADMIN_ROLE = roles.find((r) => r.Name === "Admin").RoleId;
  const USER_ROLE = roles.find((r) => r.Name === "User").RoleId;
  const stamp = `aud${Date.now().toString(36)}`;
  const created = [];
  const create = async (name, roleId, actor = ADMIN, displayName = name) => {
    const row = await one("usp_User_Create", {
      Username: `${stamp}-${name}`, PasswordHash: PLACEHOLDER_HASH, DisplayName: displayName,
      Email: null, RoleId: roleId, MustChangePassword: true, ActorUserId: actor,
    });
    created.push(row.UserId);
    return row.UserId;
  };
  const getUser = (id) => one("usp_User_GetById", { UserId: id, ActorUserId: ADMIN });
  const deactivate = async (id) =>
    exec("usp_User_Deactivate", { UserId: id, RowVer: (await getUser(id)).RowVer, ActorUserId: ADMIN });
  const list = async (actor, params = {}) => {
    const [rows] = await exec("usp_Audit_List", {
      ActorUserId: actor, ProjectId: null, Search: null, SortBy: null, SortDir: "desc", Page: 1,
      PageSize: 25, ...params,
    });
    return rows;
  };
  const entry = (id, actor) => one("usp_Audit_GetById", { AuditLogId: id, ActorUserId: actor });

  // Two Admins whose names differ only where an unescaped "%" would match: their own creates are
  // the only entries a search for the first one's name can find.
  const percent = await create("pct", ADMIN_ROLE, ADMIN, `${stamp}50%done`);
  const lookalike = await create("look", ADMIN_ROLE, ADMIN, `${stamp}50xdone`);
  const first = await create("first", USER_ROLE, percent);
  const second = await create("second", USER_ROLE, percent);
  await create("other", USER_ROLE, lookalike);
  const user = await create("user", USER_ROLE);
  const gone = await create("gone", ADMIN_ROLE);
  await deactivate(gone);

  // Who may read it.
  const [anyRow] = await list(ADMIN, { PageSize: 1 });
  const refused = [["a User", user], ["a NULL actor", null], ["a deactivated Admin", gone]];
  for (const [label, actor] of refused) {
    await expectCode(50003, `${label} cannot list the audit log`, () => list(actor));
    await expectCode(50003, `${label} cannot open an entry`, () => entry(anyRow.AuditLogId, actor));
    await expectCode(50003, `${label} learns nothing from an unknown id`, () =>
      entry(UNKNOWN_ID, actor));
  }

  // An Admin's list: TotalCount, newest first, paging, oldest first on request, no JSON.
  const search = `${stamp}50%`;
  const found = await list(ADMIN, { Search: search });
  ok(found.length === 2 && found.every((r) => r.TotalCount === 2),
    `a "%" is searched literally (${found.length} rows, TotalCount ${found[0]?.TotalCount})`);
  ok(found.every((r) => r.ActorUserId === percent && r.ActorName === `${stamp}50%done`),
    "the search finds the actor by display name, not the lookalike");
  ok(found[0]?.EntityId === String(second) && found[1]?.EntityId === String(first),
    "the list is newest first");
  ok(found.every((r) => r.Action === "Create" && r.EntityName === "auth.User"),
    "each row names its action and record");
  ok(found.every((r) => !("BeforeJson" in r) && !("AfterJson" in r)), "the list carries no JSON");
  const page2 = await list(ADMIN, { Search: search, PageSize: 1, Page: 2 });
  ok(page2.length === 1 && page2[0].EntityId === String(first) && page2[0].TotalCount === 2,
    "page 2 of 1 row each is the older entry, with the same TotalCount");
  const oldest = await list(ADMIN, { Search: search, SortBy: "OccurredAtUtc", SortDir: "asc" });
  ok(oldest[0]?.EntityId === String(first), "oldest first when asked");
  ok((await list(ADMIN, { Search: `${stamp}50_done` })).length === 0, 'a "_" is searched literally');
  ok((await list(ADMIN, { Search: "create" })).length > 0, "a word of the action finds rows");

  // GetById: both sides of one entry, never a password hash, NOT_FOUND for an unknown id.
  const opened = await entry(found[0].AuditLogId, ADMIN);
  const after = JSON.parse(opened.AfterJson);
  ok(after.UserId === second && after.Username === `${stamp}-second` && opened.BeforeJson === null,
    "an Admin opens an entry and reads what it recorded");
  ok(!("PasswordHash" in after), "the entry carries no password hash");
  await expectCode(50001, "an unknown id is NOT_FOUND for an Admin", () => entry(UNKNOWN_ID, ADMIN));

  for (const id of created) if (id !== gone) await deactivate(id);

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
