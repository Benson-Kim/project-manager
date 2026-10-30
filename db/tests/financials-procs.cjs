// Behaviour checks for the financials procs (ADR-0029/0031): object-level access across
// projects and financials, roles and per-person overrides, money and horizon rules, the template
// snapshot, captured invoice rates and parallel writes. Runs against the seeded database in the
// CI db-apply job (E2E_SEED=1: users 3 e2e-pm, 4 e2e-contributor, 5 e2e-viewer, project 2) and
// locally: node db/tests/financials-procs.cjs. Creates two throwaway projects as e2e-pm and
// leaves soft-deleted rows behind, so never point it at a real database.
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
const currencyVectors = require("../../src/modules/financials/tests/currency-vectors.json");

const ADMIN = 1;
const PM = 3;
const CONTRIB = 4;
const VIEWER = 5;
let pool;
let failures = 0;
let passes = 0;

function request(params) {
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  return req;
}

async function exec(proc, params) {
  return (await request(params).execute(proc)).recordsets;
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

(async () => {
  pool = await sql.connect({
    server: process.env.DB_SERVER || "localhost", port: Number(process.env.DB_PORT || 1433), database: process.env.DB_NAME || "ProjectManager",
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const stamp = Date.now();
  const P = await project(`fin-check-${stamp}`);
  const Q = await project(`fin-check-q-${stamp}`);
  await exec("usp_ProjectAssignee_Set", {
    ProjectId: P,
    AssigneesJson: JSON.stringify([
      { role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" },
      { role: "Team member", personName: "c", userId: CONTRIB, accessLevel: "Contributor" },
      { role: "Team member", personName: "v", userId: VIEWER, accessLevel: "Viewer" },
    ]),
    ActorUserId: PM,
  });

  // Templates
  const [templates] = await exec("usp_FinancialTemplate_List", { ActorUserId: VIEWER });
  ok(templates.length >= 1 && templates[0].IsDefault, "template list for any user, default first");
  const def = JSON.parse(templates[0].Definition);
  ok(def.taxProfiles[0].rate === "0.056879", "default template tax");
  await expectCode(50003, "template save as non-admin", () =>
    exec("usp_FinancialTemplate_Save", { Name: "x", Definition: templates[0].Definition, ActorUserId: PM }));
  for (const [label, bad] of [
    ["horizon 8", { ...def, horizonYears: 8 }],
    ["rate 1.5", { ...def, taxProfiles: [{ key: "a", name: "a", rate: "1.5" }], lines: [] }],
    ["unknown tax key", { ...def, lines: [{ ...def.lines[0], taxProfileKey: "zz" }] }],
    ["3 decimals", { ...def, lines: [{ ...def.lines[0], amount: "1.234" }] }],
    ["negative amount", { ...def, lines: [{ ...def.lines[0], amount: "-1" }] }],
    ["category too long", { ...def, costCategories: ["x".repeat(151)] }],
    ["duplicate category", { ...def, costCategories: ["a", "a"] }],
    ["bad section", { ...def, lines: [{ ...def.lines[0], section: "admin" }] }],
    ["lower-case currency", { ...def, currency: "usd" }],
    ["currency too long", { ...def, currency: "EURO" }],
    ["not an object", [1, 2]],
  ]) {
    await expectCode(50004, `template ${label}`, () =>
      exec("usp_FinancialTemplate_Save", { Name: `t-${stamp}`, Definition: JSON.stringify(bad), ActorUserId: ADMIN }));
  }
  const withAmount = { ...def, currency: "EUR", lines: [{ ...def.lines[0], amount: "350.00", isRecurrent: true }] };
  const [[tpl]] = await exec("usp_FinancialTemplate_Save", {
    Name: `t-${stamp}`, Definition: JSON.stringify(withAmount), IsDefault: 0, ActorUserId: ADMIN,
  });
  await expectCode(50005, "duplicate template name", () =>
    exec("usp_FinancialTemplate_Save", { Name: `t-${stamp}`, Definition: JSON.stringify(def), ActorUserId: ADMIN }));
  await expectCode(50002, "template stale rowver", () =>
    exec("usp_FinancialTemplate_Save", {
      FinancialTemplateId: tpl.FinancialTemplateId, Name: `t-${stamp}`, Definition: JSON.stringify(def),
      RowVer: tpl.RowVer - 1, ActorUserId: ADMIN,
    }));

  // Financial create
  await expectCode(50003, "create as viewer", () =>
    exec("usp_Financial_Create", { ProjectId: P, Title: "x", ActorUserId: VIEWER }));
  await expectCode(50003, "create as contributor", () =>
    exec("usp_Financial_Create", { ProjectId: P, Title: "x", ActorUserId: CONTRIB }));
  await expectCode(50003, "create in another project", () =>
    exec("usp_Financial_Create", { ProjectId: Q, Title: "x", ActorUserId: VIEWER }));
  await expectCode(50004, "create without title", () =>
    exec("usp_Financial_Create", { ProjectId: P, Title: "  ", ActorUserId: PM }));
  const [[fin]] = await exec("usp_Financial_Create", {
    ProjectId: P, Title: "Budget 2023", FinancialTemplateId: tpl.FinancialTemplateId,
    FirstFiscalYear: 2023, ActorUserId: PM,
  });
  ok(fin.HorizonYears === 5 && fin.FirstFiscalYear === 2023 && fin.TemplateName === `t-${stamp}`, "created from template");
  ok(JSON.parse(fin.CostCategories).length === 8, "categories copied");
  ok(fin.CurrencyCode === "EUR", "template currency copied");
  const [[finQ]] = await exec("usp_Financial_Create", { ProjectId: Q, Title: "Q", FirstFiscalYear: 2023, ActorUserId: PM });
  ok(JSON.parse(finQ.CostCategories).length === 0 && finQ.HorizonYears === 5, "blank financial");
  ok(finQ.CurrencyCode === "", "a blank financial shows no currency symbol");

  // Snapshot: template edits never reach the financial
  await exec("usp_FinancialTemplate_Save", {
    FinancialTemplateId: tpl.FinancialTemplateId, Name: `t-${stamp}`,
    Definition: JSON.stringify({ ...def, horizonYears: 2 }), RowVer: tpl.RowVer, ActorUserId: ADMIN,
  });

  let [[row], profiles, lines, amounts, txs] = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: VIEWER });
  ok(row.HorizonYears === 5, "snapshot survives a template edit");
  ok(profiles.length === 2 && profiles[0].Name === "Net tax (public body)", "profiles copied, default first");
  ok(lines.length === 1 && lines[0].IsRecurrent === true, "lines copied");
  ok(amounts.length === 1 && amounts[0].FiscalYear === 2023 && Number(amounts[0].Amount) === 350, "amount in first year");
  await expectCode(50003, "sheet of another project", async () => {
    await exec("usp_ProjectAssignee_Set", {
      ProjectId: Q, AssigneesJson: JSON.stringify([{ role: "Project manager", personName: "pm", userId: PM, accessLevel: "Manager" }]), ActorUserId: PM,
    });
    return exec("usp_Financial_GetSheet", { FinancialId: finQ.FinancialId, ActorUserId: VIEWER });
  });
  const [, profilesQ] = await exec("usp_Financial_GetSheet", { FinancialId: finQ.FinancialId, ActorUserId: PM });
  ok(profilesQ.length === 0, "blank has no profiles");

  // Lines
  const t1 = profiles[0].FinancialTaxProfileId;
  await exec("usp_FinancialTaxProfile_Set", {
    FinancialId: finQ.FinancialId, ProfilesJson: JSON.stringify([{ id: null, name: "Q tax", rate: "0.1" }]),
    RowVer: finQ.RowVer, ActorUserId: PM,
  });
  const [, [qProfile]] = await exec("usp_Financial_GetSheet", { FinancialId: finQ.FinancialId, ActorUserId: PM });
  const line = (extra) => ({
    FinancialId: fin.FinancialId, Section: "capital", Description: "Networking", FinancialTaxProfileId: t1,
    AmountsJson: JSON.stringify([{ fiscalYear: 2023, amount: "9000.00" }]), ActorUserId: PM, ...extra,
  });
  await expectCode(50004, "line with another financial's tax profile", () =>
    exec("usp_FinancialLine_Create", line({ FinancialTaxProfileId: qProfile.FinancialTaxProfileId })));
  await expectCode(50004, "amount outside horizon", () =>
    exec("usp_FinancialLine_Create", line({ AmountsJson: JSON.stringify([{ fiscalYear: 2028, amount: "1" }]) })));
  await expectCode(50004, "duplicate year", () =>
    exec("usp_FinancialLine_Create", line({ AmountsJson: JSON.stringify([{ fiscalYear: 2023, amount: "1" }, { fiscalYear: 2023, amount: "2" }]) })));
  await expectCode(50004, "negative budget", () =>
    exec("usp_FinancialLine_Create", line({ AmountsJson: JSON.stringify([{ fiscalYear: 2023, amount: "-1" }]) })));
  await expectCode(50004, "three decimals", () =>
    exec("usp_FinancialLine_Create", line({ AmountsJson: JSON.stringify([{ fiscalYear: 2023, amount: "1.005" }]) })));
  await expectCode(50004, "bad section", () => exec("usp_FinancialLine_Create", line({ Section: "admin" })));
  await expectCode(50003, "line as contributor", () => exec("usp_FinancialLine_Create", line({ ActorUserId: CONTRIB })));
  const [[l1]] = await exec("usp_FinancialLine_Create", line());
  const [[l2]] = await exec("usp_FinancialLine_Create", line({ Description: "Training", AmountsJson: "[]" }));
  ok(l1.SortOrder === 1 && l2.SortOrder === 2, "sort order per section");
  ok(JSON.parse(l1.Amounts)[0].amount === 9000, "amounts json");
  const [[moved]] = await exec("usp_FinancialLine_Move", { FinancialLineId: l2.FinancialLineId, Direction: "up", RowVer: l2.RowVer, ActorUserId: PM });
  ok(moved.SortOrder === 1, "move up");
  const [[top]] = await exec("usp_FinancialLine_Move", { FinancialLineId: l2.FinancialLineId, Direction: "up", RowVer: moved.RowVer, ActorUserId: PM });
  ok(top.SortOrder === 1, "move at top stays");

  // Per-person override: grant the contributor financials:update
  await exec("usp_ProjectPermission_Set", {
    ProjectId: P, UserId: CONTRIB, OverridesJson: JSON.stringify([{ module: "financials", verb: "update", allowed: true }]), ActorUserId: PM,
  });
  const [, , afterMove] = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: PM });
  const l1Ver = afterMove.find((l) => l.FinancialLineId === l1.FinancialLineId).RowVer;
  ok(l1Ver !== l1.RowVer, "moving a neighbour bumps its rowver");
  const [[l1b]] = await exec("usp_FinancialLine_Update", {
    FinancialLineId: l1.FinancialLineId, Section: "capital", Description: "Networking (12 h)", FinancialTaxProfileId: t1,
    AmountsJson: JSON.stringify([{ fiscalYear: 2023, amount: "9000.00" }, { fiscalYear: 2024, amount: "100.00" }]),
    RowVer: l1Ver, ActorUserId: CONTRIB,
  });
  ok(l1b.Description === "Networking (12 h)", "override lets the contributor update");
  await expectCode(50003, "override does not grant delete", () =>
    exec("usp_FinancialLine_Delete", { FinancialLineId: l2.FinancialLineId, RowVer: top.RowVer, ActorUserId: CONTRIB }));
  await expectCode(50002, "stale line update", () =>
    exec("usp_FinancialLine_Update", { FinancialLineId: l1.FinancialLineId, Section: "capital", Description: "x", RowVer: l1.RowVer, ActorUserId: PM }));

  // Transactions
  const [[tx1]] = await exec("usp_FinancialTransaction_Create", {
    FinancialLineId: l1.FinancialLineId, TransactionDate: "2024-03-31", Reference: "Facture 12164", Amount: "5000.00", ActorUserId: PM,
  });
  ok(tx1.FiscalYear === 2023 && Number(tx1.TaxRate) === 0.056879, "fiscal year derived, tax captured");
  await expectCode(50004, "zero transaction", () =>
    exec("usp_FinancialTransaction_Create", { FinancialLineId: l1.FinancialLineId, TransactionDate: "2024-01-01", Amount: "0", ActorUserId: PM }));
  await expectCode(50004, "transaction outside horizon", () =>
    exec("usp_FinancialTransaction_Create", { FinancialLineId: l1.FinancialLineId, TransactionDate: "2030-01-01", Amount: "1", ActorUserId: PM }));
  const [[credit]] = await exec("usp_FinancialTransaction_Create", {
    FinancialLineId: l1.FinancialLineId, TransactionDate: "2024-04-01", Amount: "-100.00", ActorUserId: PM,
  });
  ok(credit.FiscalYear === 2024, "credit note in next fiscal year");
  const [, [qLine]] = [null, (await exec("usp_FinancialLine_Create", { FinancialId: finQ.FinancialId, Section: "other", Description: "q", ActorUserId: PM }))[0]];
  await expectCode(50004, "move transaction to another financial's line", () =>
    exec("usp_FinancialTransaction_Update", {
      FinancialTransactionId: tx1.FinancialTransactionId, FinancialLineId: qLine.FinancialLineId, TransactionDate: "2024-03-31",
      Amount: "5000.00", RowVer: tx1.RowVer, ActorUserId: PM,
    }));
  await expectCode(50003, "transaction of another project via viewer", () =>
    exec("usp_FinancialTransaction_Delete", { FinancialTransactionId: tx1.FinancialTransactionId, RowVer: tx1.RowVer, ActorUserId: VIEWER }));

  // Tax profile changes: rate captured on transactions stays
  [[row]] = await exec("usp_Financial_GetById", { FinancialId: fin.FinancialId, ActorUserId: PM });
  await expectCode(50004, "remove a profile in use", () =>
    exec("usp_FinancialTaxProfile_Set", { FinancialId: fin.FinancialId, ProfilesJson: "[]", RowVer: row.RowVer, ActorUserId: PM }));
  await expectCode(50004, "adopt another financial's profile id", () =>
    exec("usp_FinancialTaxProfile_Set", {
      FinancialId: fin.FinancialId, RowVer: row.RowVer, ActorUserId: PM,
      ProfilesJson: JSON.stringify([{ id: t1, name: "a", rate: "0.05" }, { id: qProfile.FinancialTaxProfileId, name: "b", rate: "0.1" }]),
    }));
  const [[afterSet]] = await exec("usp_FinancialTaxProfile_Set", {
    FinancialId: fin.FinancialId, RowVer: row.RowVer, ActorUserId: PM,
    ProfilesJson: JSON.stringify([{ id: t1, name: "GST + QST (full)", rate: "0.06" }, { id: profiles[1].FinancialTaxProfileId, name: "Net tax (public body)", rate: "0.149750" }]),
  });
  ok(afterSet.RowVer !== row.RowVer, "profiles save bumps the financial rowver");
  await expectCode(50002, "stale profiles save", () =>
    exec("usp_FinancialTaxProfile_Set", { FinancialId: fin.FinancialId, ProfilesJson: "[]", RowVer: row.RowVer, ActorUserId: PM }));
  [, profiles, , , txs] = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: PM });
  ok(profiles.find((p) => p.FinancialTaxProfileId === t1).Name === "GST + QST (full)", "swapped names in one save");
  ok(Number(txs.find((t) => t.FinancialTransactionId === tx1.FinancialTransactionId).TaxRate) === 0.056879, "captured rate kept");

  // Amendment: rate steps, year-captured invoice rates, budget basis, the tax-and-invoices section
  [[row]] = await exec("usp_Financial_GetById", { FinancialId: fin.FinancialId, ActorUserId: PM });
  const [, stepProfiles] = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: PM });
  const p1 = stepProfiles.find((p) => p.FinancialTaxProfileId === t1);
  const p2 = stepProfiles.find((p) => p.FinancialTaxProfileId !== t1);
  await expectCode(50004, "duplicate step year", () =>
    exec("usp_FinancialTaxProfile_Set", {
      FinancialId: fin.FinancialId, RowVer: row.RowVer, ActorUserId: PM,
      ProfilesJson: JSON.stringify([
        { id: t1, name: p1.Name, rate: "0.056879", steps: [{ fromFiscalYear: 2025, rate: "0.06" }, { fromFiscalYear: 2025, rate: "0.07" }] },
        { id: p2.FinancialTaxProfileId, name: p2.Name, rate: String(p2.Rate) },
      ]),
    }));
  const [[stepped]] = await exec("usp_FinancialTaxProfile_Set", {
    FinancialId: fin.FinancialId, RowVer: row.RowVer, ActorUserId: PM,
    ProfilesJson: JSON.stringify([
      { id: t1, name: p1.Name, rate: "0.056879", steps: [{ fromFiscalYear: 2025, rate: "0.10" }] },
      { id: p2.FinancialTaxProfileId, name: p2.Name, rate: String(p2.Rate) },
    ]),
  });
  const [, afterSteps] = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: PM });
  ok(JSON.parse(afterSteps.find((p) => p.FinancialTaxProfileId === t1).Steps)[0].fromFiscalYear === 2025, "step stored");
  const [[tx2024]] = await exec("usp_FinancialTransaction_Create", {
    FinancialLineId: l1.FinancialLineId, TransactionDate: "2024-06-01", Amount: "10.00", ActorUserId: PM,
  });
  const [[tx2025]] = await exec("usp_FinancialTransaction_Create", {
    FinancialLineId: l1.FinancialLineId, TransactionDate: "2025-06-01", Amount: "10.00", ActorUserId: PM,
  });
  ok(Number(tx2024.TaxRate) === 0.056879 && Number(tx2025.TaxRate) === 0.1, "invoice captures its year's rate");
  const [[moved2025]] = await exec("usp_FinancialTransaction_Update", {
    FinancialTransactionId: tx2024.FinancialTransactionId, FinancialLineId: l1.FinancialLineId,
    TransactionDate: "2025-07-01", Amount: "10.00", RowVer: tx2024.RowVer, ActorUserId: PM,
  });
  ok(Number(moved2025.TaxRate) === 0.1 && moved2025.FiscalYear === 2025, "new fiscal year re-captures");
  // Contributor holds a 'financials:update' grant (above) but not the tax-and-invoices section.
  await expectCode(50003, "budget grant does not cover tax profiles", () =>
    exec("usp_FinancialTaxProfile_Set", { FinancialId: fin.FinancialId, ProfilesJson: "[]", RowVer: stepped.RowVer, ActorUserId: CONTRIB }));
  await expectCode(50003, "budget grant does not cover invoices", () =>
    exec("usp_FinancialTransaction_Create", { FinancialLineId: l1.FinancialLineId, TransactionDate: "2024-01-01", Amount: "1", ActorUserId: CONTRIB }));
  await exec("usp_ProjectPermission_Set", {
    ProjectId: P, UserId: CONTRIB, ActorUserId: PM,
    OverridesJson: JSON.stringify([
      { module: "financials", verb: "update", allowed: true },
      { module: "financial-tax-invoices", verb: "create", allowed: true },
    ]),
  });
  const [[byContrib]] = await exec("usp_FinancialTransaction_Create", {
    FinancialLineId: l1.FinancialLineId, TransactionDate: "2024-01-01", Amount: "1", ActorUserId: CONTRIB,
  });
  ok(byContrib.FinancialTransactionId > 0, "invoice grant lets the contributor record");
  await expectCode(50003, "invoice create grant does not cover delete", () =>
    exec("usp_FinancialTransaction_Delete", { FinancialTransactionId: byContrib.FinancialTransactionId, RowVer: byContrib.RowVer, ActorUserId: CONTRIB }));
  for (const t of [byContrib, tx2025, moved2025]) {
    const [, , , , current] = await exec("usp_Financial_GetSheet", { FinancialId: fin.FinancialId, ActorUserId: PM });
    const live = current.find((x) => x.FinancialTransactionId === t.FinancialTransactionId);
    await exec("usp_FinancialTransaction_Delete", { FinancialTransactionId: t.FinancialTransactionId, RowVer: live.RowVer, ActorUserId: PM });
  }
  [[row]] = await exec("usp_Financial_GetById", { FinancialId: fin.FinancialId, ActorUserId: PM });
  afterSet.RowVer = row.RowVer;

  // Horizon guard
  await expectCode(50004, "shrink horizon over amounts", () =>
    exec("usp_Financial_Update", {
      FinancialId: fin.FinancialId, Title: "Budget 2023", FirstFiscalYear: 2023, HorizonYears: 1, FiscalYearStartMonth: 4,
      EscalationRate: "0.05", FlagThresholdRate: "0.1", RowVer: afterSet.RowVer, ActorUserId: PM,
    }));
  await expectCode(50004, "invalid category list", () =>
    exec("usp_Financial_Update", {
      FinancialId: fin.FinancialId, Title: "Budget 2023", FirstFiscalYear: 2023, HorizonYears: 5, FiscalYearStartMonth: 4,
      EscalationRate: "0.05", FlagThresholdRate: "0.1", CostCategories: "{\"a\":1}", RowVer: afterSet.RowVer, ActorUserId: PM,
    }));
  // The shared refused set (src/modules/financials/tests/currency-vectors.json), the same list the
  // zod test reads. "EURO" is the vector that proves @CurrencyCode is declared wider than it
  // accepts: sized to the value it would have bound as "EUR", a different real currency, silently.
  for (const bad of currencyVectors.refused) {
    await expectCode(50004, `malformed currency ${bad}`, () =>
      exec("usp_Financial_Update", {
        FinancialId: fin.FinancialId, Title: "Budget 2023", FirstFiscalYear: 2023, HorizonYears: 5, FiscalYearStartMonth: 4,
        EscalationRate: "0.05", FlagThresholdRate: "0.1", CurrencyCode: bad, RowVer: afterSet.RowVer, ActorUserId: PM,
      }));
  }
  const [[updated]] = await exec("usp_Financial_Update", {
    FinancialId: fin.FinancialId, Title: "Budget 2023-24", ProjectNumber: 1021995, GlGrandLivre: "9300867-70560", Budget: "100000.00",
    FirstFiscalYear: 2023, HorizonYears: 7, FiscalYearStartMonth: 4, EscalationRate: "0.05", FlagThresholdRate: "0.1",
    CostCategories: JSON.stringify(["Acquisition"]), BudgetIncludesTax: 0, CurrencyCode: "eur", RowVer: afterSet.RowVer, ActorUserId: PM,
  });
  ok(updated.HorizonYears === 7 && Number(updated.Budget) === 100000 && updated.BudgetIncludesTax === false, "update settings");
  ok(updated.CurrencyCode === "EUR", "update trims and upper-cases the currency code");

  // Deletes
  await expectCode(50004, "delete a line with transactions", () =>
    exec("usp_FinancialLine_Delete", { FinancialLineId: l1.FinancialLineId, RowVer: l1b.RowVer, ActorUserId: PM }));
  await expectCode(50003, "financial delete as contributor", () =>
    exec("usp_Financial_Delete", { FinancialId: fin.FinancialId, RowVer: updated.RowVer, ActorUserId: CONTRIB }));
  await exec("usp_Financial_Delete", { FinancialId: fin.FinancialId, RowVer: updated.RowVer, ActorUserId: PM });
  await expectCode(50001, "deleted financial is gone", () => exec("usp_Financial_GetById", { FinancialId: fin.FinancialId, ActorUserId: PM }));
  await expectCode(50001, "its lines are gone", () =>
    exec("usp_FinancialLine_Update", { FinancialLineId: l2.FinancialLineId, Section: "capital", Description: "x", RowVer: top.RowVer, ActorUserId: PM }));

  // Concurrency: 12 parallel line creates all land with distinct sort orders
  await Promise.all(Array.from({ length: 12 }, (_, i) =>
    exec("usp_FinancialLine_Create", { FinancialId: finQ.FinancialId, Section: "capital", Description: `p${i}`, ActorUserId: PM })));
  const [, , qLines] = await exec("usp_Financial_GetSheet", { FinancialId: finQ.FinancialId, ActorUserId: PM });
  const orders = qLines.filter((l) => l.Section === "capital").map((l) => l.SortOrder);
  ok(new Set(orders).size === 12, `parallel creates keep distinct sort orders (${orders})`);

  // The list row carries the currency (the project card formats money from it, not from a sheet),
  // and CK_Financial_CurrencyCode refuses what the proc's UPPER() would have fixed up.
  const [[qRow]] = await exec("usp_Financial_GetById", { FinancialId: finQ.FinancialId, ActorUserId: PM });
  // The shared accepted set, normalise-then-shape. Each write consumes a RowVer, so thread it on.
  let qVer = qRow.RowVer;
  for (const { input, stored } of currencyVectors.accepted) {
    const [[r]] = await exec("usp_Financial_Update", {
      FinancialId: finQ.FinancialId, Title: "Q", FirstFiscalYear: 2023, HorizonYears: 5, FiscalYearStartMonth: 4,
      EscalationRate: "0.05", FlagThresholdRate: "0.1", CurrencyCode: input, RowVer: qVer, ActorUserId: PM,
    });
    ok(r.CurrencyCode === stored, `the proc stores ${JSON.stringify(input)} as ${JSON.stringify(stored)}`);
    qVer = r.RowVer;
  }
  await exec("usp_Financial_Update", {
    FinancialId: finQ.FinancialId, Title: "Q", FirstFiscalYear: 2023, HorizonYears: 5, FiscalYearStartMonth: 4,
    EscalationRate: "0.05", FlagThresholdRate: "0.1", CurrencyCode: "jpy", RowVer: qVer, ActorUserId: PM,
  });
  const [list] = await exec("usp_Financial_List", { ActorUserId: PM, ProjectId: Q, Search: "q" });
  ok(list.length === 1 && list[0].LineCount === 13 && list[0].ActorAccess === "Manager", "list");
  ok(list[0].CurrencyCode === "JPY", "the list row carries the currency");
  // CK_Financial_CurrencyCode is NOT checked here. These tests connect as the app's EXECUTE-only
  // login (ADR-0033), so a direct write is refused with 229 before any constraint can run, which
  // db/verify/app_login.sql separately asserts must be true. The constraint is verified as the
  // admin login in db/verify/currency_check.sql, in this same CI job.

  await exec("usp_FinancialTemplate_Delete", { FinancialTemplateId: tpl.FinancialTemplateId, RowVer: (await exec("usp_FinancialTemplate_GetById", { FinancialTemplateId: tpl.FinancialTemplateId, ActorUserId: PM }))[0][0].RowVer, ActorUserId: ADMIN });
  console.log(`${passes} passed, ${failures} failed`);
  await pool.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("CRASH", e.number, e.message);
  process.exit(2);
});
