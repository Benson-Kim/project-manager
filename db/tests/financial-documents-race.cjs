// Race checks for the financial document checklist (ADR-0030): concurrent calls must not overrun
// the 50-document cap, duplicate a name (parallel creates, copies and renames), exceed the file
// quota, or leave a live attachment on a deleted document or financial. Runs in the CI db-apply job
// after the seeds and locally: node db/tests/financial-documents-race.cjs. Creates a throwaway
// project as e2e-pm, so never point it at a real database.
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
const q = async (stmt) => (await pool.request().query(stmt)).recordset;
const sha = (n) => n.toString(16).padStart(64, "0");
const spath = (h) => `${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`;
const settle = (fns) => Promise.allSettled(fns.map((f) => f()));
const codes = (rs) => rs.map((r) => (r.status === "fulfilled" ? "ok" : r.reason.number));

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433), database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true }, pool: { max: 30 },
  });
  const stamp = Date.now();
  const [[p]] = await exec("usp_Project_Create", {
    ProjectName: `race-${stamp}`, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0, Requisition: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  const newFin = async (t) => (await exec("usp_Financial_Create", { ProjectId: p.ProjectId, Title: t, FirstFiscalYear: 2023, ActorUserId: PM }))[0][0];

  // 1. Cap: 45 listed, 20 parallel distinct creates -> exactly 5 land.
  const f1 = await newFin("cap");
  for (let i = 0; i < 45; i++) await exec("usp_FinancialDocument_Create", { FinancialId: f1.FinancialId, Name: `d${i}`, ActorUserId: PM });
  const r1 = codes(await settle(Array.from({ length: 20 }, (_, i) => () =>
    exec("usp_FinancialDocument_Create", { FinancialId: f1.FinancialId, Name: `race${i}`, ActorUserId: PM }))));
  const [{ n: n1 }] = await q(`SELECT COUNT(*) n FROM app.FinancialDocument WHERE FinancialId=${f1.FinancialId} AND IsDeleted=0`);
  ok(n1 === 50 && r1.filter((c) => c === "ok").length === 5, `cap holds: ${n1} live, ${JSON.stringify(r1)}`);

  // 2. Parallel copies from the default template never duplicate a name.
  const f2 = await newFin("copy");
  const [tpls] = await exec("usp_FinancialTemplate_List", { ActorUserId: PM });
  const std = tpls.find((t) => t.Name === "Standard (MSSS)");
  const r2 = await settle(Array.from({ length: 6 }, () => () =>
    exec("usp_FinancialDocument_CreateFromTemplate", { FinancialId: f2.FinancialId, FinancialTemplateId: std.FinancialTemplateId, ActorUserId: PM })));
  const added = r2.filter((r) => r.status === "fulfilled").map((r) => r.value[0][0].Added);
  const [{ n: n2 }] = await q(`SELECT COUNT(*) n FROM app.FinancialDocument WHERE FinancialId=${f2.FinancialId} AND IsDeleted=0`);
  ok(n2 === 9 && added.reduce((a, b) => a + b, 0) === 9, `parallel copies: ${n2} live, added ${added}`);

  // 3. Parallel renames to one name: one wins, the rest DUPLICATE or CONFLICT-free failures.
  const [docs] = await q(`SELECT FinancialDocumentId, CAST(RowVer AS BIGINT) RowVer FROM app.FinancialDocument WHERE FinancialId=${f2.FinancialId} AND IsDeleted=0`).then((r) => [r]);
  const r3 = codes(await settle(docs.slice(0, 8).map((d) => () =>
    exec("usp_FinancialDocument_Update", { FinancialDocumentId: d.FinancialDocumentId, Name: "Same name", RowVer: Number(d.RowVer), ActorUserId: PM }))));
  const [{ n: n3 }] = await q(`SELECT COUNT(*) n FROM app.FinancialDocument WHERE FinancialId=${f2.FinancialId} AND IsDeleted=0 AND Name=N'Same name'`);
  ok(n3 === 1 && r3.filter((c) => c === "ok").length === 1, `parallel renames: ${n3} hold the name, ${JSON.stringify(r3)}`);

  // 4. Quota: room for 3 files of 100 bytes; 10 parallel uploads -> exactly 3 land.
  const [[can]] = await exec("usp_FinancialDocument_CanAddFile", { FinancialDocumentId: docs[0].FinancialDocumentId, ActorUserId: PM });
  const quota = Number(can.UsedBytes) + 300;
  const r4 = codes(await settle(Array.from({ length: 10 }, (_, i) => () => {
    const h = sha(stamp * 100 + i);
    return exec("usp_FinancialDocument_AddFile", {
      FinancialDocumentId: docs[0].FinancialDocumentId, FileName: `f${i}.pdf`, ContentType: "application/pdf",
      SizeBytes: 100, Sha256: h, StoragePath: spath(h), QuotaBytes: quota, ActorUserId: PM,
    });
  })));
  ok(r4.filter((c) => c === "ok").length === 3 && r4.filter((c) => c === 50006).length === 7, `quota holds: ${JSON.stringify(r4)}`);

  // 5. Delete vs attach: no live attachment may outlive its document or financial.
  for (let round = 0; round < 15; round++) {
    const f = await newFin(`del-${round}`);
    const [[d]] = await exec("usp_FinancialDocument_Create", { FinancialId: f.FinancialId, Name: "D", ActorUserId: PM });
    const attach = Array.from({ length: 4 }, (_, i) => () =>
      exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: d.FinancialDocumentId, FileName: `l${i}`, StorageLocation: "x", ActorUserId: PM }));
    const kill = round % 2
      ? () => exec("usp_FinancialDocument_Delete", { FinancialDocumentId: d.FinancialDocumentId, RowVer: d.RowVer, ActorUserId: PM })
      : () => exec("usp_Financial_Delete", { FinancialId: f.FinancialId, RowVer: f.RowVer, ActorUserId: PM });
    const order = round % 3 === 0 ? [kill, ...attach] : [...attach.slice(0, 2), kill, ...attach.slice(2)];
    await settle(order);
  }
  const [{ n: orphans }] = await q(`
    SELECT COUNT(*) n FROM app.FileAttachment a
    JOIN app.FinancialDocumentFile l ON l.FileAttachmentId = a.FileAttachmentId
    JOIN app.FinancialDocument d ON d.FinancialDocumentId = l.FinancialDocumentId
    JOIN app.Financial f ON f.FinancialId = d.FinancialId
    WHERE a.IsDeleted = 0 AND (d.IsDeleted = 1 OR f.IsDeleted = 1)`);
  ok(orphans === 0, `no live attachment on a deleted owner (${orphans})`);

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
