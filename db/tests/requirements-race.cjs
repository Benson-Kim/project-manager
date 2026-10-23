// Race checks for requirement traceability (ADR-0037): parallel creates of the same project and
// type must get distinct reference numbers with no duplicate-key error; a trace link racing the
// delete of its target must never leave a link to a deleted requirement; a type change racing a
// new incoming link must never leave an invalid link; and parallel moves under one deliverable
// must leave the order 1..n. Runs in the CI db-apply job after the seeds and locally:
// node db/tests/requirements-race.cjs. Creates a throwaway project as e2e-pm, so never point it at
// a real database.
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
let pool;
let failures = 0;
let passes = 0;
const ok = (c, l) => (c ? passes++ : (failures++, console.log("FAIL", l)));
async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  return (await req.execute(proc)).recordsets;
}
const settle = (fns) => Promise.allSettled(fns.map((f) => f()));
const codes = (rs) => rs.map((r) => (r.status === "fulfilled" ? "ok" : r.reason.number));
async function create(params) {
  return (await exec("usp_Requirement_Create", { ActorUserId: PM, ...params }))[0][0];
}

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true }, pool: { max: 30 },
  });
  const stamp = Date.now();
  const project = async (name) =>
    (await exec("usp_Project_Create", {
      ProjectName: name, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0, Requisition: 0, DO: 0,
      PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
    }))[0][0].ProjectId;
  const deliverable = async (projectId, name) =>
    (await exec("usp_KeyDeliverable_Create", {
      ProjectId: projectId, KeyRequirement: name, StartDate: new Date("2026-01-05"),
      Deadline: new Date("2026-01-12"), ActorUserId: PM,
    }))[0][0];
  const P = await project(`req-race-${stamp}`);

  // 1. Parallel creates of one project and type: distinct numbers, no duplicate-key error.
  const r1 = await settle(
    Array.from({ length: 20 }, (_, i) => () => create({ ProjectId: P, RequirementType: "FR", Requirement: `race ${i}` })),
  );
  const made = r1.filter((r) => r.status === "fulfilled").map((r) => r.value.Number);
  ok(made.length === 20 && new Set(made).size === 20, `20 parallel creates get 20 distinct numbers (${made.length} ok, ${new Set(made).size} distinct)`);
  ok(new Set(made).size === made.length && Math.max(...made) === made.length, "the numbers are a gap-free 1..n");

  // 2. A new link racing the delete of its target never leaves a link to a deleted requirement.
  for (let round = 0; round < 15; round++) {
    const need = await create({ ProjectId: P, RequirementType: "BR", Requirement: `need ${round}` });
    const sol = await create({ ProjectId: P, RequirementType: "FR", Requirement: `sol ${round}` });
    await settle([
      () => exec("usp_Requirement_Update", {
        RequirementId: sol.RequirementId, RequirementType: "FR", Requirement: sol.Requirement, IsMet: 0,
        ValidatesSet: 1, ValidatesIds: JSON.stringify([need.RequirementId]), RowVer: sol.RowVer, ActorUserId: PM,
      }),
      () => exec("usp_Requirement_Delete", { RequirementId: need.RequirementId, RowVer: need.RowVer, ActorUserId: PM }),
    ]);
    // The lock serialises the two, and a delete removes traces both ways, so the surviving
    // solution never validates the deleted need.
    const suspect = (await exec("usp_Requirement_GetById", { RequirementId: sol.RequirementId, ActorUserId: PM }))[0][0];
    const validates = JSON.parse(suspect.ValidatesJson || "[]");
    ok(validates.every((v) => v.id !== need.RequirementId), `round ${round}: no link to the deleted need`);
  }
  // The register must never surface a link to a deleted requirement (ufn filters IsDeleted).
  const all = (await exec("usp_Requirement_List", { ActorUserId: PM, ProjectId: P, PageSize: 500 }))[0];
  const danglers = all.filter((r) => JSON.parse(r.ValidatesJson || "[]").some((v) => v.id == null));
  ok(danglers.length === 0, "no listed requirement shows a link to a missing need");

  // 3. A type change racing a new incoming link never leaves an invalid link (a solution validating
  //    a row that just became a solution). The resulting-state check and the lock serialise them.
  for (let round = 0; round < 15; round++) {
    const need = await create({ ProjectId: P, RequirementType: "BR", Requirement: `flip ${round}` });
    const sol = await create({ ProjectId: P, RequirementType: "FR", Requirement: `cover ${round}` });
    const res = codes(await settle([
      () => exec("usp_Requirement_Update", {
        RequirementId: sol.RequirementId, RequirementType: "FR", Requirement: sol.Requirement, IsMet: 0,
        ValidatesSet: 1, ValidatesIds: JSON.stringify([need.RequirementId]), RowVer: sol.RowVer, ActorUserId: PM,
      }),
      () => exec("usp_Requirement_Update", {
        RequirementId: need.RequirementId, RequirementType: "FR", Requirement: need.Requirement, IsMet: 0,
        RowVer: need.RowVer, ActorUserId: PM,
      }),
    ]));
    const n = (await exec("usp_Requirement_GetById", { RequirementId: need.RequirementId, ActorUserId: PM }))[0][0];
    // If the need became a solution, nothing may still validate it.
    const invalid = n.RequirementType !== "BR" && JSON.parse(n.ValidatedByJson || "[]").length > 0;
    ok(!invalid, `type change vs new link stays valid (${res})`);
  }

  // 4. Parallel moves under one deliverable leave the order a gap-free 1..n.
  const d = await deliverable(P, "race-d");
  const placed = [];
  for (let i = 0; i < 6; i++) {
    placed.push(await create({
      ProjectId: P, RequirementType: "FR", Requirement: `ord ${i}`,
      KeyDeliverableIds: JSON.stringify([d.KeyDeliverableId]),
    }));
  }
  const alloc = (await exec("usp_KeyDeliverable_GanttData", { ProjectId: P, ActorUserId: PM, WithProjectRow: 1 }))[0]
    .find((r) => r.KeyDeliverableId === d.KeyDeliverableId);
  const order = JSON.parse(alloc.RequirementsJson || "[]");
  await settle(order.slice(0, 5).map((r, i) => () =>
    exec("usp_Requirement_Move", {
      RequirementId: r.id, KeyDeliverableId: d.KeyDeliverableId, Position: (i % 6) + 1,
      RowVer: r.placeRowVer, ActorUserId: PM,
    })));
  const after = JSON.parse(
    (await exec("usp_KeyDeliverable_GanttData", { ProjectId: P, ActorUserId: PM, WithProjectRow: 1 }))[0]
      .find((r) => r.KeyDeliverableId === d.KeyDeliverableId).RequirementsJson || "[]",
  );
  const orders = after.map((r) => r.sortOrder).sort((a, b) => a - b);
  ok(JSON.stringify(orders) === JSON.stringify([1, 2, 3, 4, 5, 6]), `parallel moves leave 1..n (${orders})`);

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
