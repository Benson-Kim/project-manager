// Behaviour checks for the push-subscription procs: who may retire whose browser endpoint.
// A push subscription is an object with an owner, so retiring one is an object-level
// authorization decision (ADR-0021) — but neither retire proc checked the owner. Both were
// safe only because every caller passed a server-derived id with @ActorUserId = 0 (the
// dispatch service) or the session's own user id. The checks these assertions cover close
// that: usp_AlertSubscription_Deactivate now refuses a subscription the actor does not own,
// and usp_AlertSubscription_DeactivateByUser lets only the user themselves or an Admin
// retire a user's endpoints. Without them, the "future UI" the Deactivate proc was written
// for would have silenced another user's to-do notifications by passing their id.
//
// Runs against the seeded database in the CI db-apply job (E2E_SEED=1: users 1 admin,
// 3 e2e-pm, 5 e2e-viewer) and locally: node db/tests/alert-subscription-procs.cjs. Leaves
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

const ADMIN = 1;
const OWNER = 3;
const OTHER = 5;
const DISPATCH = 0;
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
async function subscribe(endpoint, actor) {
  const [[row]] = await exec("usp_AlertSubscription_Upsert", {
    Endpoint: endpoint, P256dh: "p256dh-test-key", Auth: "auth-test-key",
    ExpirationTimeUtc: null, ActorUserId: actor,
  });
  return row;
}
const deactivate = (id, actor) =>
  exec("usp_AlertSubscription_Deactivate", { AlertSubscriptionId: id, ActorUserId: actor });
const deactivateByUser = (userId, actor) =>
  exec("usp_AlertSubscription_DeactivateByUser", { UserId: userId, ActorUserId: actor });

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const stamp = `https://push.example/${Date.now()}`;

  // ---- a subscription belongs to the user who registered it ----------------------------------
  const mine = await subscribe(`${stamp}/a`, OWNER);
  ok(mine.UserId === OWNER, "a subscription is stored under the registering user");

  // ---- Deactivate: only the owner, or the dispatch service -----------------------------------
  await expectCode(50003, "another user cannot retire my subscription", () =>
    deactivate(mine.AlertSubscriptionId, OTHER));
  await expectCode(50003, "nor can an Admin, who has no business in one endpoint", () =>
    deactivate(mine.AlertSubscriptionId, ADMIN));
  await deactivate(mine.AlertSubscriptionId, OWNER);
  // Re-registering the endpoint proves the row really was retired: the proc only reuses a
  // live row, so a new id means the old one is gone.
  const again = await subscribe(`${stamp}/a`, OWNER);
  ok(again.AlertSubscriptionId !== mine.AlertSubscriptionId, "the owner's retire took effect");

  // The dispatch service retires an endpoint Web Push rejected, whoever owns it.
  await deactivate(again.AlertSubscriptionId, DISPATCH);
  const third = await subscribe(`${stamp}/a`, OWNER);
  ok(third.AlertSubscriptionId !== again.AlertSubscriptionId, "the dispatch service may retire any");

  // An unknown or already-retired id is a silent no-op, not an error (the dispatch loop).
  await deactivate(third.AlertSubscriptionId, DISPATCH);
  await deactivate(third.AlertSubscriptionId, DISPATCH);
  ok(true, "retiring an already-retired subscription is a no-op");

  // ---- DeactivateByUser: the user themselves, an Admin, or the internal caller ---------------
  const forLogout = await subscribe(`${stamp}/b`, OWNER);
  ok(forLogout.UserId === OWNER, "a second endpoint registers for the same user");
  await expectCode(50003, "another user cannot retire a user's endpoints", () =>
    deactivateByUser(OWNER, OTHER));
  await deactivateByUser(OWNER, OWNER);
  const afterSelf = await subscribe(`${stamp}/b`, OWNER);
  ok(afterSelf.AlertSubscriptionId !== forLogout.AlertSubscriptionId, "logout retires my own");

  // An Admin forces a logout; the internal caller does it with no actor at all.
  await deactivateByUser(OWNER, ADMIN);
  const afterAdmin = await subscribe(`${stamp}/b`, OWNER);
  ok(afterAdmin.AlertSubscriptionId !== afterSelf.AlertSubscriptionId, "an Admin forces a logout");
  await deactivateByUser(OWNER, DISPATCH);
  const afterDispatch = await subscribe(`${stamp}/b`, OWNER);
  ok(
    afterDispatch.AlertSubscriptionId !== afterAdmin.AlertSubscriptionId,
    "the internal caller retires a user's endpoints",
  );
  await expectCode(50004, "an unknown user id is refused", () => deactivateByUser(2147483647, ADMIN));

  // ---- one endpoint belongs to one user at a time ---------------------------------------------
  // A shared browser profile: signing in as someone else takes the endpoint over, so the
  // first account stops receiving the second account's to-do titles.
  const shared = await subscribe(`${stamp}/c`, OWNER);
  const taken = await subscribe(`${stamp}/c`, OTHER);
  ok(taken.UserId === OTHER, "re-registering an endpoint transfers it to the new user");
  ok(taken.AlertSubscriptionId !== shared.AlertSubscriptionId, "and the previous row is retired");
  await expectCode(50003, "the previous owner can no longer retire it", () =>
    deactivate(taken.AlertSubscriptionId, OWNER));
  await deactivateByUser(OTHER, OTHER);

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
