// Behaviour checks for the financial document checklist procs (ADR-0030): template documents
// and their validation, the snapshot copy on create, roles and per-person overrides, object-level
// access across projects, duplicate names, caps, moves, copy from a template, attachments (quota,
// cross-owner ids both ways, rename, remove), cascades on document and financial delete, the
// dropped legacy procs and parallel same-name creates. Runs against the seeded database in the CI
// db-apply job (E2E_SEED=1: users 1 admin, 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer; daily
// activity 1) and locally: node db/tests/financial-documents-procs.cjs. Creates throwaway projects
// and leaves soft-deleted rows behind, so never point it at a real database.
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
const PM = 3;
const CONTRIB = 4;
const VIEWER = 5;
let pool;
let failures = 0;
let passes = 0;

async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  const res = await req.execute(proc);
  return res.recordsets;
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
    ProjectName: name, A1: 0, DA: 0, DAS: 0, PurchaseOrder: 0, Requisition: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  return row.ProjectId;
}
const sha = (n) => n.toString(16).padStart(64, "0");
const spath = (n) => { const h = sha(n); return `${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`; };

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433), database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const stamp = Date.now();
  const P = await project(`doc-check-${stamp}`);
  const Q = await project(`doc-check-q-${stamp}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });

  // Templates: the default carries the nine documents; bad documents are refused.
  const [templates] = await exec("usp_FinancialTemplate_List", { ActorUserId: VIEWER });
  const std = templates.find((t) => t.Name === "Standard (MSSS)");
  const def = JSON.parse(std.Definition);
  ok(Array.isArray(def.documents) && def.documents.length === 9, "default template has 9 documents");
  const doc0 = def.documents[0];
  for (const [label, docs] of [
    ["not a list", { a: 1 }],
    ["blank name", [{ ...doc0, name: " " }]],
    ["long name", [{ ...doc0, name: "x".repeat(201) }]],
    ["duplicate", [doc0, doc0]],
    ["required string", [{ ...doc0, required: "yes" }]],
    ["reason number", [{ ...doc0, reason: 5 }]],
    ["reason too long", [{ ...doc0, reason: "r".repeat(2001) }]],
    ["bad kind", [{ ...doc0, suggestions: [{ kind: "x", reason: "r" }] }]],
    ["repeat kind", [{ ...doc0, suggestions: [{ kind: "noCapital", reason: "a" }, { kind: "noCapital", reason: "b" }] }]],
    ["zero threshold", [{ ...doc0, suggestions: [{ kind: "budgetBelow", amount: "0", reason: "r" }] }]],
    ["3 decimals", [{ ...doc0, suggestions: [{ kind: "budgetBelow", amount: "1.234", reason: "r" }] }]],
    ["noCapital amount", [{ ...doc0, suggestions: [{ kind: "noCapital", amount: "5", reason: "r" }] }]],
    ["blank reason", [{ ...doc0, suggestions: [{ kind: "noCapital", reason: " " }] }]],
    ["51 documents", Array.from({ length: 51 }, (_, i) => ({ name: `d${i}` }))],
    ["suggestion not object", [{ ...doc0, suggestions: [1] }]],
  ]) {
    await expectCode(50004, `template documents ${label}`, () =>
      exec("usp_FinancialTemplate_Save", {
        Name: `dt-${stamp}`, Definition: JSON.stringify({ ...def, documents: docs }), ActorUserId: ADMIN,
      }));
  }
  const [[tpl]] = await exec("usp_FinancialTemplate_Save", {
    Name: `dt-${stamp}`,
    Definition: JSON.stringify({ ...def, documents: [...def.documents.slice(0, 3), { name: "Extra", required: true, reason: null, suggestions: [] }] }),
    ActorUserId: ADMIN,
  });

  // Create copies the checklist (snapshot)
  const [[fin]] = await exec("usp_Financial_Create", {
    ProjectId: P, Title: "Docs", FinancialTemplateId: tpl.FinancialTemplateId, FirstFiscalYear: 2023, ActorUserId: PM,
  });
  let sets = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: VIEWER });
  let docs = sets[5];
  ok(docs.length === 4 && docs[0].Name === "DA (Dossier d'affaires)" && docs[3].Name === "Extra", "documents copied in order");
  ok(docs[0].IsRequired === null && docs[3].IsRequired === true, "tri-state copied");
  ok(JSON.parse(docs[0].Suggestions).length === 2, "suggestions copied");
  ok(sets[6].length === 0, "no files yet");
  const [[blank]] = await exec("usp_Financial_Create", { ProjectId: Q, Title: "Blank", FirstFiscalYear: 2023, ActorUserId: PM });
  ok((await exec("usp_Financial_GetSheet", { FinancialId: blank.FinancialId, ActorUserId: PM }))[5].length === 0, "blank has no documents");

  // Roles and BOLA
  await expectCode(50003, "create doc as viewer", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "v", ActorUserId: VIEWER }));
  await expectCode(50003, "create doc as contributor", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "c", ActorUserId: CONTRIB }));
  await expectCode(50003, "create doc in another project's financial", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: blank.FinancialId, Name: "x", ActorUserId: VIEWER }));
  await expectCode(50001, "create doc on unknown financial", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: 99999999, Name: "x", ActorUserId: PM }));
  await expectCode(50003, "update doc as viewer", () =>
    exec("usp_FinancialDocument_Update", { FinancialDocumentId: docs[0].FinancialDocumentId, Name: "x", RowVer: docs[0].RowVer, ActorUserId: VIEWER }));
  await expectCode(50003, "move doc as contributor", () =>
    exec("usp_FinancialDocument_Move", { FinancialDocumentId: docs[0].FinancialDocumentId, Direction: "down", RowVer: docs[0].RowVer, ActorUserId: CONTRIB }));
  await expectCode(50003, "delete doc as viewer", () =>
    exec("usp_FinancialDocument_Delete", { FinancialDocumentId: docs[0].FinancialDocumentId, RowVer: docs[0].RowVer, ActorUserId: VIEWER }));
  await expectCode(50003, "copy from template as viewer", () =>
    exec("usp_FinancialDocument_CreateFromTemplate", { FinancialId: fin.FinancialId, FinancialTemplateId: std.FinancialTemplateId, ActorUserId: VIEWER }));
  await expectCode(50003, "can add file as viewer", () =>
    exec("usp_FinancialDocument_CanAddFile", { FinancialDocumentId: docs[0].FinancialDocumentId, ActorUserId: VIEWER }));
  const [[vlist]] = [await exec("usp_FinancialDocument_ListFiles", { FinancialDocumentId: docs[0].FinancialDocumentId, ActorUserId: VIEWER })];
  ok(Array.isArray(vlist), "viewer lists files");

  // Override: a contributor granted financials:update may edit documents and files, not delete
  await exec("usp_ProjectPermission_Set", {
    ProjectId: P, UserId: CONTRIB, OverridesJson: JSON.stringify([{ module: "financials", verb: "update", allowed: true }]), ActorUserId: PM,
  });
  const [[upd]] = await exec("usp_FinancialDocument_Update", {
    FinancialDocumentId: docs[0].FinancialDocumentId, Name: docs[0].Name, IsRequired: false,
    ReasonNotCreated: "  Non-capitalizable  ", Suggestions: docs[0].Suggestions, RowVer: docs[0].RowVer, ActorUserId: CONTRIB,
  });
  ok(upd.IsRequired === false && upd.ReasonNotCreated === "Non-capitalizable", "granted contributor updates, reason trimmed");
  await expectCode(50003, "granted contributor still cannot delete", () =>
    exec("usp_FinancialDocument_Delete", { FinancialDocumentId: upd.FinancialDocumentId, RowVer: upd.RowVer, ActorUserId: CONTRIB }));
  await expectCode(50002, "stale rowver", () =>
    exec("usp_FinancialDocument_Update", { FinancialDocumentId: upd.FinancialDocumentId, Name: "x", RowVer: docs[0].RowVer, ActorUserId: PM }));

  // Validation
  await expectCode(50005, "duplicate name on create", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: " Extra ", ActorUserId: PM }));
  await expectCode(50005, "duplicate name on rename", () =>
    exec("usp_FinancialDocument_Update", { FinancialDocumentId: upd.FinancialDocumentId, Name: "Extra", RowVer: upd.RowVer, ActorUserId: PM }));
  await expectCode(50004, "blank name", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "   ", ActorUserId: PM }));
  await expectCode(50004, "reason too long", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "long", ReasonNotCreated: "r".repeat(2001), ActorUserId: PM }));
  await expectCode(50004, "bad suggestions", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "s", Suggestions: '[{"kind":"budgetBelow","reason":"r"}]', ActorUserId: PM }));
  await expectCode(50004, "suggestions not json", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "s", Suggestions: "nope", ActorUserId: PM }));
  await expectCode(50004, "repeat kind on a financial document", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "s", Suggestions: '[{"kind":"noCapital","reason":"a"},{"kind":"noCapital","reason":"b"}]', ActorUserId: PM }));
  const [[undecided]] = await exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "Undecided", IsRequired: null, ActorUserId: PM });
  ok(undecided.IsRequired === null && undecided.SortOrder === 5, "undecided appended at the end");

  // Move
  const [[moved]] = await exec("usp_FinancialDocument_Move", { FinancialDocumentId: undecided.FinancialDocumentId, Direction: "up", RowVer: undecided.RowVer, ActorUserId: PM });
  ok(moved.SortOrder === 4, "moved up");
  await expectCode(50004, "bad direction", () =>
    exec("usp_FinancialDocument_Move", { FinancialDocumentId: moved.FinancialDocumentId, Direction: "left", RowVer: moved.RowVer, ActorUserId: PM }));

  // Copy from template skips listed names, respects the cap
  const [[copy]] = await exec("usp_FinancialDocument_CreateFromTemplate", { FinancialId: fin.FinancialId, FinancialTemplateId: std.FinancialTemplateId, ActorUserId: PM });
  ok(copy.Added === 6, `copy skips the 3 listed names (added ${copy.Added})`);
  const [[copy2]] = await exec("usp_FinancialDocument_CreateFromTemplate", { FinancialId: fin.FinancialId, FinancialTemplateId: std.FinancialTemplateId, ActorUserId: PM });
  ok(copy2.Added === 0, "second copy adds nothing");
  await expectCode(50001, "copy from unknown template", () =>
    exec("usp_FinancialDocument_CreateFromTemplate", { FinancialId: fin.FinancialId, FinancialTemplateId: 99999999, ActorUserId: PM }));
  for (let i = 0; i < 39; i++) await exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: `fill ${i}`, ActorUserId: PM });
  await expectCode(50004, "51st document", () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin.FinancialId, Name: "too many", ActorUserId: PM }));

  // Files: add, quota, list, get, rename, cross-owner, remove
  const target = docs[3];
  await expectCode(50004, "file and location at once", () =>
    exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: target.FinancialDocumentId, FileName: "a.pdf", ContentType: "application/pdf", SizeBytes: 10, Sha256: sha(1), StoragePath: spath(1), StorageLocation: "\\\\srv\\a", ActorUserId: PM }));
  await expectCode(50003, "add file as viewer", () =>
    exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: target.FinancialDocumentId, FileName: "v.pdf", StorageLocation: "x", ActorUserId: VIEWER }));
  await expectCode(50006, "quota", () =>
    exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: target.FinancialDocumentId, FileName: "big.pdf", ContentType: "application/pdf", SizeBytes: 2000, Sha256: sha(2), StoragePath: spath(2), QuotaBytes: 1000, ActorUserId: PM }));
  const [[file]] = await exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: target.FinancialDocumentId, FileName: "contract.pdf", ContentType: "application/pdf", SizeBytes: 100, Sha256: sha(3), StoragePath: spath(3), QuotaBytes: 10000, ActorUserId: PM });
  const [[loc]] = await exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: target.FinancialDocumentId, FileName: "Signed copy", StorageLocation: "Drawer 3", ActorUserId: PM });
  const [[can]] = await exec("usp_FinancialDocument_CanAddFile", { FinancialDocumentId: target.FinancialDocumentId, ActorUserId: PM });
  ok(can.ProjectId === P && Number(can.UsedBytes) === 100, "can-add reports project bytes");
  const [listed] = await exec("usp_FinancialDocument_ListFiles", { FinancialDocumentId: target.FinancialDocumentId, ActorUserId: VIEWER });
  ok(listed.length === 2, "viewer lists two attachments");
  const [[got]] = await exec("usp_FinancialDocument_GetFile", { FileAttachmentId: file.FileAttachmentId, ActorUserId: VIEWER });
  ok(got.Sha256 === sha(3), "viewer gets the file");
  await exec("usp_ProjectAssignee_Set", { ProjectId: Q, AssigneesJson: JSON.stringify([{ role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" }]), ActorUserId: PM });
  const [[qdoc]] = await exec("usp_FinancialDocument_Create", { FinancialId: blank.FinancialId, Name: "Q doc", ActorUserId: PM });
  const [[qfile]] = await exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: qdoc.FinancialDocumentId, FileName: "q", StorageLocation: "q", ActorUserId: PM });
  await expectCode(50003, "get file from another project", () =>
    exec("usp_FinancialDocument_GetFile", { FileAttachmentId: qfile.FileAttachmentId, ActorUserId: VIEWER }));
  await expectCode(50003, "list files from another project", () =>
    exec("usp_FinancialDocument_ListFiles", { FinancialDocumentId: qdoc.FinancialDocumentId, ActorUserId: VIEWER }));
  await expectCode(50003, "remove file from another project", () =>
    exec("usp_FinancialDocument_RemoveFile", { FileAttachmentId: qfile.FileAttachmentId, RowVer: qfile.RowVer, ActorUserId: CONTRIB }));
  const [[renamed]] = await exec("usp_FinancialDocument_RenameFile", { FileAttachmentId: file.FileAttachmentId, FileName: "signed", RowVer: file.RowVer, ActorUserId: PM });
  ok(renamed.FileName === "signed.pdf", "rename keeps the extension");
  // A daily-activity attachment is not reachable through the financial-document owner.
  const [[act]] = await exec("usp_DailyActivity_AddFile", { DailyActivityId: 1, FileName: "da-loc", StorageLocation: "somewhere", ActorUserId: ADMIN });
  await expectCode(50001, "cross-owner get", () =>
    exec("usp_FinancialDocument_GetFile", { FileAttachmentId: act.FileAttachmentId, ActorUserId: ADMIN }));
  await expectCode(50001, "cross-owner rename", () =>
    exec("usp_FinancialDocument_RenameFile", { FileAttachmentId: act.FileAttachmentId, FileName: "x", RowVer: act.RowVer, ActorUserId: ADMIN }));
  await expectCode(50001, "cross-owner remove", () =>
    exec("usp_FinancialDocument_RemoveFile", { FileAttachmentId: act.FileAttachmentId, RowVer: act.RowVer, ActorUserId: ADMIN }));
  await expectCode(50001, "reverse cross-owner get", () =>
    exec("usp_DailyActivity_GetFile", { FileAttachmentId: file.FileAttachmentId, ActorUserId: ADMIN }));
  await exec("usp_DailyActivity_RemoveFile", { FileAttachmentId: act.FileAttachmentId, RowVer: act.RowVer, ActorUserId: ADMIN });
  await exec("usp_FinancialDocument_RemoveFile", { FileAttachmentId: loc.FileAttachmentId, RowVer: loc.RowVer, ActorUserId: PM });

  // Sheet and list reflect files and decisions
  await exec("usp_FinancialDocument_Update", { FinancialDocumentId: target.FinancialDocumentId, Name: "Extra", IsRequired: true, RowVer: (await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: PM }))[5].find((d) => d.FinancialDocumentId === target.FinancialDocumentId).RowVer, ActorUserId: PM });
  sets = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: VIEWER });
  ok(sets[6].length === 1 && sets[6][0].FileName === "signed.pdf", "sheet lists the live file only");
  ok(sets[5].find((d) => d.FinancialDocumentId === target.FinancialDocumentId).FileCount === 1, "file count");
  const [list] = await exec("usp_Financial_List", { ActorUserId: VIEWER, ProjectId: P });
  const lrow = list.find((r) => r.FinancialId === fin.FinancialId);
  ok(lrow.DocumentCount === 50 && lrow.DocumentsRequired === 1 && lrow.DocumentsRequiredWithFile === 1 && lrow.DocumentsNotRequired === 1, `list counts ${JSON.stringify(lrow)}`);

  // Delete a document cascades its files; deleting the financial cascades everything
  const [[file2]] = await exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: docs[1].FinancialDocumentId, FileName: "das.pdf", ContentType: "application/pdf", SizeBytes: 5, Sha256: sha(4), StoragePath: spath(4), ActorUserId: PM });
  const d1 = (await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: PM }))[5].find((d) => d.FinancialDocumentId === docs[1].FinancialDocumentId);
  await exec("usp_FinancialDocument_Delete", { FinancialDocumentId: d1.FinancialDocumentId, RowVer: d1.RowVer, ActorUserId: PM });
  await expectCode(50001, "file of a deleted document", () =>
    exec("usp_FinancialDocument_GetFile", { FileAttachmentId: file2.FileAttachmentId, ActorUserId: PM }));
  await expectCode(50001, "add file to a deleted document", () =>
    exec("usp_FinancialDocument_AddFile", { FinancialDocumentId: d1.FinancialDocumentId, FileName: "z", StorageLocation: "z", ActorUserId: PM }));
  const [[finRow]] = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: PM });
  await exec("usp_Financial_Delete", { FinancialId: fin.FinancialId, RowVer: finRow.RowVer, ActorUserId: PM });
  await expectCode(50001, "file of a deleted financial", () =>
    exec("usp_FinancialDocument_GetFile", { FileAttachmentId: file.FileAttachmentId, ActorUserId: PM }));
  await expectCode(50001, "document of a deleted financial", () =>
    exec("usp_FinancialDocument_ListFiles", { FinancialDocumentId: target.FinancialDocumentId, ActorUserId: PM }));
  const [[live]] = await exec("usp_FinancialDocument_CanAddFile", { FinancialDocumentId: undecided.FinancialDocumentId, ActorUserId: PM }).catch(() => [[null]]);
  ok(live === null, "can-add on a deleted financial's document fails");

  // Legacy procs are gone (dropped by migration 034): calling one is error 2812.
  for (const proc of ["usp_FinancialDocument_GetById", "usp_FinancialDocument_List", "usp_Financial_GetDocumentChecklist"]) {
    await expectCode(2812, `${proc} dropped`, () => exec(proc, { ActorUserId: PM }));
  }

  // Parallel creates of the same name: exactly one wins
  const [[fin3]] = await exec("usp_Financial_Create", { ProjectId: P, Title: "Race", FirstFiscalYear: 2023, ActorUserId: PM });
  const results = await Promise.allSettled(Array.from({ length: 6 }, () =>
    exec("usp_FinancialDocument_Create", { FinancialId: fin3.FinancialId, Name: "Same", ActorUserId: PM })));
  const wins = results.filter((r) => r.status === "fulfilled").length;
  const dups = results.filter((r) => r.status === "rejected" && r.reason.number === 50005).length;
  ok(wins === 1 && dups === 5, `parallel same-name creates: ${wins} won, ${dups} duplicate`);

  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
