// Behaviour checks for Settings > Users: who may manage accounts. Every user proc refuses a
// non-Admin (and a NULL or deactivated actor), an unknown id tells a non-Admin nothing, a User
// reads only their own row and sets only their own password, an Admin never demotes or
// deactivates themselves, deactivate and a role change revoke live sessions, and two Admins
// demoting each other at once leave exactly one change: usp_User_AssertAdminChange serialises them,
// so the second sees its actor is no longer an Admin. The last-Admin rule is defence in depth: an
// active Admin actor other than the target is always another Admin, so only the self rule can
// trip first. Runs against the seeded database in the CI db-apply job (user 1 = admin) and
// locally: node db/tests/users-procs.cjs. Creates throwaway accounts and leaves them deactivated,
// so never point it at a real database.
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
const ROUNDS = 5;
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
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const [roles] = await exec("usp_Role_List", {});
  const ADMIN_ROLE = roles.find((r) => r.Name === "Admin").RoleId;
  const USER_ROLE = roles.find((r) => r.Name === "User").RoleId;
  const stamp = `usr${Date.now().toString(36)}`;
  const created = [];
  const create = async (name, roleId, actor = ADMIN) => {
    const row = await one("usp_User_Create", {
      Username: `${stamp}-${name}`, PasswordHash: PLACEHOLDER_HASH, DisplayName: name,
      Email: null, RoleId: roleId, MustChangePassword: true, ActorUserId: actor,
    });
    created.push(row.UserId);
    return row.UserId;
  };
  const get = (id, actor = ADMIN) => one("usp_User_GetById", { UserId: id, ActorUserId: actor });
  const update = async (id, actor, changes) => {
    const row = await get(id);
    return one("usp_User_Update", {
      UserId: id, DisplayName: row.DisplayName, Email: row.Email, RoleId: row.RoleId,
      IsActive: row.IsActive, MustChangePassword: row.MustChangePassword, RowVer: row.RowVer,
      ActorUserId: actor, ...changes,
    });
  };
  const deactivate = async (id, actor) =>
    exec("usp_User_Deactivate", { UserId: id, RowVer: (await get(id)).RowVer, ActorUserId: actor });
  const setPassword = (id, actor) =>
    exec("usp_User_SetPassword", {
      UserId: id, PasswordHash: PLACEHOLDER_HASH, MustChangePassword: true, ActorUserId: actor,
    });

  const user = await create("user", USER_ROLE);
  const other = await create("other", USER_ROLE);
  const admin = await create("admin", ADMIN_ROLE);
  const target = await get(other);

  // A User is refused by every proc that manages accounts.
  await expectCode(50003, "a User cannot create an account", () => create("nope", USER_ROLE, user));
  await expectCode(50003, "a User cannot list accounts", () =>
    exec("usp_User_List", { ActorUserId: user, Page: 1, PageSize: 25 }));
  await expectCode(50003, "a User cannot read another account", () => get(other, user));
  await expectCode(50003, "a User cannot set another's password", () => setPassword(other, user));
  await expectCode(50003, "a User cannot edit an account", () =>
    exec("usp_User_Update", {
      UserId: other, DisplayName: "x", Email: null, RoleId: ADMIN_ROLE, IsActive: true,
      MustChangePassword: false, RowVer: target.RowVer, ActorUserId: user,
    }));
  await expectCode(50003, "a User cannot promote themselves", () =>
    update(user, user, { RoleId: ADMIN_ROLE }));
  await expectCode(50003, "a User cannot deactivate an account", () =>
    exec("usp_User_Deactivate", { UserId: other, RowVer: target.RowVer, ActorUserId: user }));
  await expectCode(50003, "an unknown id tells a User nothing (FORBIDDEN, not NOT_FOUND)", () =>
    exec("usp_User_Deactivate", { UserId: 2147483000, RowVer: 1, ActorUserId: user }));
  await expectCode(50001, "an Admin learns an unknown id is not found", () =>
    exec("usp_User_Deactivate", { UserId: 2147483000, RowVer: 1, ActorUserId: admin }));

  // A NULL actor is no one, never "self".
  await expectCode(50003, "a NULL actor cannot read an account", () => get(other, null));
  await expectCode(50003, "a NULL actor cannot set a password", () => setPassword(other, null));

  // Your own row and password are yours.
  ok((await get(user, user)).UserId === user, "a User reads their own account");
  const before = (await get(user)).SessionVersion;
  await setPassword(user, user);
  ok((await get(user)).SessionVersion > before, "a User sets their own password; other sessions end");

  // An Admin manages others, never their own access.
  ok((await exec("usp_User_List", { ActorUserId: admin, Page: 1, PageSize: 25 }))[0].length > 0,
    "an Admin lists accounts");
  await expectCode(50004, "an Admin cannot demote themselves", () =>
    update(admin, admin, { RoleId: USER_ROLE }), "your own role");
  await expectCode(50004, "an Admin cannot deactivate themselves", () =>
    deactivate(admin, admin), "your own role");
  const renamed = await update(admin, admin, { DisplayName: "admin renamed" });
  ok(renamed.DisplayName === "admin renamed", "an Admin still edits their own name");

  // Deactivate and a role change end live sessions; a deactivated Admin manages nothing.
  let v = (await get(other)).SessionVersion;
  await update(other, admin, { RoleId: ADMIN_ROLE });
  ok((await get(other)).SessionVersion > v, "a role change ends the account's sessions");
  v = (await get(other)).SessionVersion;
  await deactivate(other, admin);
  const off = await get(other);
  ok(!off.IsActive && off.SessionVersion > v, "deactivate signs the account out");
  await expectCode(50003, "a deactivated Admin cannot create accounts", () =>
    create("ghost", USER_ROLE, other));
  await update(other, admin, { IsActive: true, RoleId: USER_ROLE });
  ok((await get(other)).IsActive === true, "an Admin reactivates an account");
  await expectCode(50002, "a stale RowVer conflicts", () =>
    exec("usp_User_Deactivate", { UserId: other, RowVer: target.RowVer, ActorUserId: admin }));

  // Two Admins demoting each other at once: exactly one change lands.
  for (let round = 0; round < ROUNDS; round++) {
    const a = await create(`race${round}a`, ADMIN_ROLE);
    const b = await create(`race${round}b`, ADMIN_ROLE);
    const [ra, rb] = [await get(a), await get(b)];
    const demote = (row, actor) =>
      exec("usp_User_Update", {
        UserId: row.UserId, DisplayName: row.DisplayName, Email: row.Email, RoleId: USER_ROLE,
        IsActive: true, MustChangePassword: row.MustChangePassword, RowVer: row.RowVer,
        ActorUserId: actor,
      });
    const results = await Promise.allSettled([demote(rb, a), demote(ra, b)]);
    const won = results.filter((r) => r.status === "fulfilled").length;
    const lost = results.filter((r) => r.status === "rejected").map((r) => r.reason.number);
    ok(won === 1 && lost[0] === 50003, `race ${round}: one demotion wins (${won} won, lost ${lost})`);
    const admins = [await get(a), await get(b)].filter((r) => r.RoleId === ADMIN_ROLE).length;
    ok(admins === 1, `race ${round}: exactly one of the two is still an Admin`);
  }

  for (const id of created) await deactivate(id, ADMIN);

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
