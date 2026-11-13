// Behaviour checks for the requirement register's column names and added columns (ADR-0067):
// a rename writes only a label (never the key or the data), names unique ignoring case across the
// built-in and added columns, the row version on every write, a delete that keeps values, a kind
// change refused while values exist, choices renamed by id and kept while in use, the filter by
// choice id, the access level each needs, audit with old and new names. Runs against the seeded
// database in the CI db-apply job (E2E_SEED=1: users 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer)
// and locally: node db/tests/register-columns-procs.cjs. Creates throwaway projects.
// Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (DB_NAME must be set; .env fills the rest).
require("./support/test-env.cjs");
const sql = require("mssql");
const { openAuditTrail } = require("./support/audit-trail.cjs");

const PM = 3;
const CONTRIB = 4;
const VIEWER = 5;
const BUILT_IN = JSON.stringify([
  { key: "Ref", name: "Ref" },
  { key: "Requirement", name: "Requirement" },
  { key: "IsMet", name: "Met" },
]);
let pool;
let failures = 0;
let passes = 0;

async function exec(proc, params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) {
    if (k.endsWith("Json")) req.input(k, sql.NVarChar(sql.MAX), v);
    else req.input(k, v);
  }
  return (await req.execute(proc)).recordsets;
}
const one = async (proc, params) => (await exec(proc, params))[0]?.[0];
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
async function project(name, withTeam = true) {
  const row = await one("usp_Project_Create", {
    ProjectName: name, A1: 0, DA: 0, DAS: 0, DO: 0,
    PurchaseEquipment: 0, SimilarProject: 0, ActorUserId: PM,
  });
  if (!withTeam) return row.ProjectId;
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: row.ProjectId,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });
  return row.ProjectId;
}
const requirement = async (projectId, text) =>
  one("usp_Requirement_Create", { ProjectId: projectId, RequirementType: "BR", Requirement: text, ActorUserId: PM });
const setLabel = (projectId, key, label, rowVer = null, actor = PM) =>
  one("usp_RequirementLabel_Set", {
    ProjectId: projectId, ColumnKey: key, Label: label, RowVer: rowVer, BuiltInJson: BUILT_IN, ActorUserId: actor,
  });
const addColumn = (projectId, name, kind, choices = null, actor = PM) =>
  one("usp_RequirementColumn_Create", {
    ProjectId: projectId, Name: name, Kind: kind,
    OptionsJson: choices ? JSON.stringify(choices) : null, BuiltInJson: BUILT_IN, ActorUserId: actor,
  });
const columns = async (projectId, actor = PM) =>
  (await exec("usp_RequirementColumn_List", { ProjectId: projectId, ActorUserId: actor }))[0];
const setCell = (req, col, value, rowVer, actor = PM) =>
  one("usp_RequirementCell_Set", {
    RequirementId: req.RequirementId, RequirementColumnId: col.RequirementColumnId,
    Value: value, RowVer: rowVer, ActorUserId: actor,
  });
const list = async (projectId, extra = {}) =>
  (await exec("usp_Requirement_List", { ActorUserId: PM, ProjectId: projectId, PageSize: 100, ...extra }))[0];
const cells = (row) => JSON.parse(row.CustomCellsJson ?? "[]");
let auditTrail;
const audits = (entity, id) => auditTrail.of(entity, id, { withJson: true });

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 300000,
  });
  auditTrail = await openAuditTrail(exec);
  const stamp = Date.now();
  const P = await project(`register-cols-${stamp}`);
  const Q = await project(`register-cols-q-${stamp}`, false);
  const r1 = await requirement(P, `Pay by card ${stamp}`);
  const r2 = await requirement(P, `Pay by cash ${stamp}`);

  // Built-in names: a label row only; clearing it brings the default back.
  const label = await setLabel(P, "Requirement", "  Need  ", null, CONTRIB);
  ok(label.Label === "Need" && label.ColumnKey === "Requirement", "a contributor renames a built-in column, trimmed");
  const before = (await list(P)).find((r) => r.RequirementId === r1.RequirementId);
  ok(before.Requirement === `Pay by card ${stamp}`, "the data under a renamed column is untouched");
  await expectCode(50002, "a second first-rename (stale: no version)", () => setLabel(P, "Requirement", "Want"));
  const renamed = await setLabel(P, "Requirement", "Want", label.RowVer);
  ok(renamed.Label === "Want", "a rename under the current version lands");
  await expectCode(50002, "a rename under a stale version", () => setLabel(P, "Requirement", "Wish", label.RowVer));
  await expectCode(50005, "a built-in name clash, ignoring case", () => setLabel(P, "Ref", "MET"));
  await expectCode(50005, "a clash with another renamed column", () => setLabel(P, "Ref", "want"));
  ok((await setLabel(P, "Ref", "Requirement")).Label === "Requirement", "a freed default name can be taken");
  await expectCode(50004, "an unknown column key", () => setLabel(P, "Secret", "x"));
  await expectCode(50004, "a name over 80 characters", () => setLabel(P, "IsMet", "x".repeat(81)));
  await expectCode(50003, "a viewer cannot rename", () => setLabel(P, "IsMet", "Done?", null, VIEWER));
  await expectCode(50003, "another project's member cannot rename", () =>
    exec("usp_RequirementLabel_Set", { ProjectId: Q, ColumnKey: "IsMet", Label: "x", RowVer: null, BuiltInJson: BUILT_IN, ActorUserId: CONTRIB }));
  const trail = await audits("app.RequirementLabel", `${P}:Requirement`);
  ok(trail.length === 2 && JSON.parse(trail[1].BeforeJson).label === "Need" && JSON.parse(trail[1].AfterJson).label === "Want",
    "each rename is audited with the old and the new name");
  const labels = (await exec("usp_RequirementLabel_List", { ProjectId: P, ActorUserId: VIEWER }))[0];
  ok(labels.length === 2, "a viewer reads the project's names");
  await exec("usp_RequirementLabel_Clear", { ProjectId: P, ColumnKey: "Requirement", RowVer: renamed.RowVer, ActorUserId: PM });
  ok(!(await exec("usp_RequirementLabel_List", { ProjectId: P, ActorUserId: PM }))[0].some((l) => l.ColumnKey === "Requirement"),
    "clearing a name brings the default back");
  ok((await list(P)).length === 2, "clearing a name leaves every row");

  // Added columns: names unique against built-ins and each other, the cap, kinds.
  const status = await addColumn(P, "Status", "choice", ["Open", "Closed"], CONTRIB);
  const due = await addColumn(P, "Due", "date");
  ok(status.Kind === "choice" && due.Kind === "date", "a contributor adds columns");
  await expectCode(50005, "an added column named like a built-in one", () => addColumn(P, "met", "text"));
  await expectCode(50005, "an added column named like a renamed one", () => addColumn(P, "requirement", "text"));
  await expectCode(50005, "two added columns with one name", () => addColumn(P, "STATUS", "text"));
  await expectCode(50005, "a built-in renamed to an added column's name", () => setLabel(P, "IsMet", "due"));
  await expectCode(50004, "a choice list with no choice", () => addColumn(P, "Empty", "choice", []));
  await expectCode(50005, "a choice list with a repeated choice", () => addColumn(P, "Twice", "choice", ["A", "a"]));
  await expectCode(50004, "choices on a text column", () => addColumn(P, "Txt", "text", ["A"]));
  await expectCode(50003, "a viewer cannot add a column", () => addColumn(P, "V", "text", null, VIEWER));
  const cols = await columns(P, VIEWER);
  const statusRow = cols.find((c) => c.RequirementColumnId === status.RequirementColumnId);
  const [open, closed] = JSON.parse(statusRow.OptionsJson);
  ok(open.label === "Open" && closed.label === "Closed", "a viewer reads the columns with their choices");
  await addColumn(P, "Extra 1", "text");
  await addColumn(P, "Extra 2", "document");
  const extra3 = await addColumn(P, "Extra 3", "text");
  await expectCode(50004, "a sixth added column", () => addColumn(P, "Extra 4", "text"));

  // Values keyed by column id: a rename never moves them.
  let row1 = await setCell(r1, status, String(open.id), r1.RowVer, CONTRIB);
  row1 = await setCell(r1, due, "2026-12-01", row1.RowVer);
  await expectCode(50002, "a cell write under a stale requirement version", () => setCell(r1, due, "2026-12-02", r1.RowVer));
  await expectCode(50004, "a choice of another column", () => setCell(r1, due, String(open.id), row1.RowVer));
  await expectCode(50004, "a choice id that is not a choice", () => setCell(r1, status, "999999", row1.RowVer));
  const linkColumn = (await columns(P)).find((c) => c.Name === "Extra 2");
  await expectCode(50004, "a bad link", () => setCell(r1, linkColumn, "javascript:x", row1.RowVer));
  await setCell(r2, status, String(closed.id), r2.RowVer);
  const renamedColumn = await one("usp_RequirementColumn_Rename", {
    RequirementColumnId: status.RequirementColumnId, Name: "State", RowVer: status.RowVer, BuiltInJson: BUILT_IN, ActorUserId: CONTRIB,
  });
  ok(renamedColumn.Name === "State", "an added column is renamed");
  await expectCode(50002, "a column rename under a stale version", () =>
    exec("usp_RequirementColumn_Rename", { RequirementColumnId: status.RequirementColumnId, Name: "Phase", RowVer: status.RowVer, BuiltInJson: BUILT_IN, ActorUserId: PM }));
  const afterRename = (await list(P)).find((r) => r.RequirementId === r1.RequirementId);
  ok(cells(afterRename).some((c) => c.columnId === status.RequirementColumnId && c.optionId === open.id),
    "the values stay under a renamed column");

  // Choices: a rename keeps the id, so values and filters follow; one in use cannot go.
  const optionRows = JSON.parse((await columns(P)).find((c) => c.RequirementColumnId === status.RequirementColumnId).OptionsJson);
  const openNow = optionRows.find((o) => o.id === open.id);
  await one("usp_RequirementColumnOption_Rename", { RequirementColumnOptionId: open.id, Label: "Active", RowVer: openNow.rowVer, ActorUserId: CONTRIB });
  const filtered = await list(P, { CustomColumnId: status.RequirementColumnId, CustomOptionId: open.id });
  ok(filtered.length === 1 && filtered[0].RequirementId === r1.RequirementId, "the filter by a renamed choice keeps its rows");
  await expectCode(50005, "two choices with one name", () =>
    exec("usp_RequirementColumnOption_Create", { RequirementColumnId: status.RequirementColumnId, Label: "closed", ActorUserId: PM }));
  await expectCode(50004, "a choice in use cannot be deleted", () =>
    exec("usp_RequirementColumnOption_Delete", { RequirementColumnOptionId: closed.id, RowVer: optionRows.find((o) => o.id === closed.id).rowVer, ActorUserId: PM }));
  const spare = await one("usp_RequirementColumnOption_Create", { RequirementColumnId: status.RequirementColumnId, Label: "Parked", ActorUserId: CONTRIB });
  await expectCode(50003, "a contributor cannot delete a choice", () =>
    exec("usp_RequirementColumnOption_Delete", { RequirementColumnOptionId: spare.id, RowVer: spare.rowVer, ActorUserId: CONTRIB }));
  await exec("usp_RequirementColumnOption_Delete", { RequirementColumnOptionId: spare.id, RowVer: spare.rowVer, ActorUserId: PM });
  ok(!JSON.parse((await columns(P)).find((c) => c.RequirementColumnId === status.RequirementColumnId).OptionsJson).some((o) => o.id === spare.id),
    "an unused choice is deleted");

  // Kind changes: refused while the column holds values; allowed while empty.
  const dueNow = (await columns(P)).find((c) => c.RequirementColumnId === due.RequirementColumnId);
  ok(dueNow.HasValues === true, "a column with values says so");
  await expectCode(50004, "a kind change on a column with values", () =>
    exec("usp_RequirementColumn_SetKind", { RequirementColumnId: due.RequirementColumnId, Kind: "text", RowVer: dueNow.RowVer, ActorUserId: PM }));
  const extra3Now = (await columns(P)).find((c) => c.RequirementColumnId === extra3.RequirementColumnId);
  const changed = await one("usp_RequirementColumn_SetKind", {
    RequirementColumnId: extra3.RequirementColumnId, Kind: "choice", OptionsJson: JSON.stringify(["Low", "High"]), RowVer: extra3Now.RowVer, ActorUserId: CONTRIB,
  });
  ok(changed.Kind === "choice", "an empty column changes kind");

  // Delete: Manager only, soft, values kept and recoverable.
  const statusNow = (await columns(P)).find((c) => c.RequirementColumnId === status.RequirementColumnId);
  await expectCode(50003, "a contributor cannot delete a column", () =>
    exec("usp_RequirementColumn_Delete", { RequirementColumnId: status.RequirementColumnId, RowVer: statusNow.RowVer, ActorUserId: CONTRIB }));
  await expectCode(50002, "a delete under a stale version", () =>
    exec("usp_RequirementColumn_Delete", { RequirementColumnId: status.RequirementColumnId, RowVer: status.RowVer, ActorUserId: PM }));
  await exec("usp_RequirementColumn_Delete", { RequirementColumnId: status.RequirementColumnId, RowVer: statusNow.RowVer, ActorUserId: PM });
  ok(!(await columns(P)).some((c) => c.RequirementColumnId === status.RequirementColumnId), "a deleted column leaves the register");
  ok(!cells((await list(P)).find((r) => r.RequirementId === r1.RequirementId)).some((c) => c.columnId === status.RequirementColumnId),
    "its values leave the rows");
  ok((await addColumn(P, "Status", "text")).Name === "Status", "its name is free again, under a new id");
  const deleteAudit = (await audits("app.RequirementColumn", status.RequirementColumnId)).pop();
  ok(deleteAudit.Action === "Delete" && JSON.parse(deleteAudit.AfterJson).valuesHidden === 2, "the delete audits how many values it hid");

  // Two people renaming one column at once: exactly one lands.
  const race = (await columns(P)).find((c) => c.Name === "Extra 1");
  const results = await Promise.allSettled([
    one("usp_RequirementColumn_Rename", { RequirementColumnId: race.RequirementColumnId, Name: "Left", RowVer: race.RowVer, BuiltInJson: BUILT_IN, ActorUserId: PM }),
    one("usp_RequirementColumn_Rename", { RequirementColumnId: race.RequirementColumnId, Name: "Right", RowVer: race.RowVer, BuiltInJson: BUILT_IN, ActorUserId: CONTRIB }),
  ]);
  ok(results.filter((r) => r.status === "fulfilled").length === 1, "two renames on one version: one lands");
  ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.number === 50002), "the other gets a conflict");

  await pool.close();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
