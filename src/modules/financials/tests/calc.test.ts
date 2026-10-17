import { describe, expect, it } from "vitest";
import {
  buildMonitor,
  buildPlan,
  lineAmounts,
  rateOf,
  statusOf,
  transactionCost,
  type CalcLine,
  type CalcSettings,
  type CalcTransaction,
} from "../calc/engine";
import { fiscalYearLabel, fiscalYearOf, horizonYears, inHorizon } from "../calc/fiscal";
import {
  applyRate,
  centsFromDb,
  centsToDecimal,
  divRound,
  formatMoney,
  formatMoneyField,
  formatPercent,
  microsFromDb,
  microsToFraction,
  parseMoney,
  parsePercent,
  shareOf,
} from "../calc/money";

/** docs/source/Financials Calculated.xlsx, Parameters!B1 and B2. */
const WORKBOOK_TAX = 56879n;
const WORKBOOK_ESCALATION = 50000n;

const settings: CalcSettings = {
  firstFiscalYear: 2023,
  horizonYears: 5,
  escalationMicros: WORKBOOK_ESCALATION,
  flagThresholdMicros: 100000n,
};

const profiles = [{ id: 1, rateMicros: WORKBOOK_TAX }];

function line(
  id: number,
  section: CalcLine["section"],
  amounts: Record<number, number>,
  taxed = true,
  isRecurrent = false,
): CalcLine {
  return {
    id,
    section,
    taxProfileId: taxed ? 1 : null,
    isRecurrent,
    amounts: new Map(Object.entries(amounts).map(([y, a]) => [Number(y), BigInt(a * 100)])),
  };
}

/** Budget Execution rows 11-13 and 19-20 with their 2023-2024 amounts. */
const workbookLines = [
  line(11, "operating", { 2023: 350 }),
  line(12, "operating", { 2023: 5000 }),
  line(13, "operating", { 2023: 1000 }, false),
  line(19, "capital", { 2023: 9000 }),
  line(20, "capital", { 2023: 6000 }),
];

describe("money", () => {
  it("rounds half away from zero like Excel ROUND", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divRound(-4n, 3n)).toBe(-1n);
    expect(divRound(6n, 3n)).toBe(2n);
  });

  it("applies the workbook's net tax to the cent (Budget Execution column H)", () => {
    expect(applyRate(35000n, WORKBOOK_TAX)).toBe(36991n);
    expect(applyRate(500000n, WORKBOOK_TAX)).toBe(528440n);
    expect(applyRate(900000n, WORKBOOK_TAX)).toBe(951191n);
    expect(applyRate(600000n, WORKBOOK_TAX)).toBe(634127n);
    expect(applyRate(-35000n, WORKBOOK_TAX)).toBe(-36991n);
    expect(applyRate(123n, 0n)).toBe(123n);
  });

  it("takes a share of an amount", () => {
    expect(shareOf(36991n, 100000n)).toBe(3699n);
  });

  it("parses typed amounts and refuses anything else", () => {
    expect(parseMoney("1,234.5")).toBe(123450n);
    expect(parseMoney(" 1 000.25 ")).toBe(100025n);
    expect(parseMoney("-12")).toBe(-1200n);
    expect(parseMoney("0.07")).toBe(7n);
    expect(parseMoney("999999999.99")).toBe(99999999999n);
    for (const bad of ["", "1e5", "1.234", "12,34", "1000000000", "abc", "--1", "0x10", "1,2345"]) {
      expect(parseMoney(bad), bad).toBeNull();
    }
  });

  it("converts driver numbers and formats", () => {
    expect(centsFromDb(5284.4)).toBe(528440n);
    expect(centsFromDb("0.1")).toBe(10n);
    expect(centsToDecimal(-123450n)).toBe("-1234.50");
    expect(centsToDecimal(5n)).toBe("0.05");
    expect(formatMoney(123456789n)).toBe("1,234,567.89");
    expect(formatMoney(-150n)).toBe("(1.50)");
    expect(formatMoney(0n)).toBe("0.00");
  });

  it("shows an amount in its field with separators that parse back", () => {
    expect(formatMoneyField("1000.00")).toBe("1,000.00");
    expect(formatMoneyField("-1234.5")).toBe("-1,234.50");
    expect(parseMoney(formatMoneyField("-1234.5"))).toBe(-123450n);
    expect(formatMoneyField("")).toBe("");
    expect(formatMoneyField("abc")).toBe("abc");
  });

  it("parses and formats percentages as micros", () => {
    expect(parsePercent("5.6879")).toBe(WORKBOOK_TAX);
    expect(parsePercent("5 %")).toBe(WORKBOOK_ESCALATION);
    expect(parsePercent("100")).toBe(1000000n);
    for (const bad of ["100.0001", "-1", "5.12345", "", "x"])
      expect(parsePercent(bad), bad).toBeNull();
    expect(microsFromDb(0.056879)).toBe(WORKBOOK_TAX);
    expect(microsToFraction(WORKBOOK_TAX)).toBe("0.056879");
    expect(microsToFraction(1000000n)).toBe("1.000000");
    expect(formatPercent(WORKBOOK_TAX)).toBe("5.6879");
    expect(formatPercent(50000n)).toBe("5");
    expect(formatPercent(0n)).toBe("0");
  });
});

describe("fiscal years", () => {
  it("labels and assigns dates to April-start fiscal years", () => {
    expect(fiscalYearLabel(2023, 4)).toBe("2023-2024");
    expect(fiscalYearLabel(2023, 1)).toBe("2023");
    expect(fiscalYearOf("2024-03-31", 4)).toBe(2023);
    expect(fiscalYearOf("2024-04-01", 4)).toBe(2024);
    expect(fiscalYearOf("2024-01-15", 1)).toBe(2024);
    expect(fiscalYearOf("15/01/2024", 4)).toBeNull();
    expect(horizonYears(2023, 3)).toEqual([2023, 2024, 2025]);
    expect(inHorizon(2027, 2023, 5)).toBe(true);
    expect(inHorizon(2028, 2023, 5)).toBe(false);
    expect(inHorizon(2022, 2023, 5)).toBe(false);
  });
});

describe("budget plan", () => {
  const plan = buildPlan(settings, profiles, workbookLines);

  it("reproduces Budget Execution's sections and totals", () => {
    expect(plan.years).toEqual([2023, 2024, 2025, 2026, 2027]);
    expect(plan.lines.get(13)!.withTax).toBe(100000n);
    // G16/H16, G21/H21, G27/H27, G28, G29.
    expect(plan.sections.operating.beforeTax).toBe(635000n);
    expect(plan.sections.operating.withTax).toBe(665431n);
    expect(plan.sections.capital.beforeTax).toBe(1500000n);
    expect(plan.sections.capital.withTax).toBe(1585318n);
    expect(plan.sections.other.withTax).toBe(0n);
    expect(plan.total.byYear[0]).toEqual({
      fiscalYear: 2023,
      beforeTax: 2135000n,
      withTax: 2250749n,
    });
    expect(plan.total.beforeTax).toBe(2135000n);
    expect(plan.total.withTax).toBe(2250749n);
  });

  it("escalates recurrent lines from the last typed year, rounding each year", () => {
    const recurrent = line(1, "operating", { 2024: 1000, 2026: 2000 }, true, true);
    expect(lineAmounts(recurrent, plan.years, WORKBOOK_ESCALATION)).toEqual([
      { fiscalYear: 2023, beforeTax: 0n, source: "none" },
      { fiscalYear: 2024, beforeTax: 100000n, source: "typed" },
      { fiscalYear: 2025, beforeTax: 105000n, source: "escalated" },
      { fiscalYear: 2026, beforeTax: 200000n, source: "typed" },
      { fiscalYear: 2027, beforeTax: 210000n, source: "escalated" },
    ]);
    const odd = line(2, "operating", { 2023: 333.33 }, true, true);
    expect(
      lineAmounts(odd, [2023, 2024, 2025], WORKBOOK_ESCALATION).map((a) => a.beforeTax),
    ).toEqual([33333n, 35000n, 36750n]);
  });

  it("stops a recurrent chain at a typed zero and ignores amounts outside the horizon", () => {
    const stopped = line(3, "other", { 2023: 100, 2025: 0, 2031: 5 }, false, true);
    const cells = buildPlan(settings, profiles, [stopped]).lines.get(3)!.cells;
    expect(cells.map((c) => c.beforeTax)).toEqual([10000n, 10500n, 0n, 0n, 0n]);
  });

  it("prices each year at the rate in force that year", () => {
    const stepped = [
      {
        id: 1,
        rateMicros: WORKBOOK_TAX,
        steps: [
          { fromFiscalYear: 2026, rateMicros: 100000n },
          { fromFiscalYear: 2025, rateMicros: 60000n },
        ],
      },
    ];
    expect(rateOf(stepped, 1, 2024)).toBe(WORKBOOK_TAX);
    expect(rateOf(stepped, 1, 2025)).toBe(60000n);
    expect(rateOf(stepped, 1, 2027)).toBe(100000n);
    expect(rateOf(stepped, 1)).toBe(WORKBOOK_TAX);
    const flat = line(9, "operating", { 2023: 100, 2024: 100, 2025: 100, 2026: 100 });
    expect(
      buildPlan(settings, stepped, [flat])
        .lines.get(9)!
        .cells.map((c) => c.withTax),
    ).toEqual([10569n, 10569n, 10600n, 11000n, 0n]);
  });

  it("treats an unknown tax profile as no tax", () => {
    expect(rateOf(profiles, 99)).toBe(0n);
    expect(rateOf(profiles, null)).toBe(0n);
  });
});

describe("monitoring", () => {
  const tx = (id: number, lineId: number, amount: number, fiscalYear = 2023): CalcTransaction => ({
    id,
    lineId,
    fiscalYear,
    amountCents: BigInt(Math.round(amount * 100)),
    taxRateMicros: lineId === 13 ? 0n : WORKBOOK_TAX,
  });
  /** Monitoring execution budget column D. */
  const transactions = [
    tx(1, 11, 150),
    tx(2, 12, 4980),
    tx(3, 13, 1000),
    tx(4, 19, 5000),
    tx(5, 20, 500),
    tx(6, 20, 2500),
    tx(7, 20, 3000),
    tx(8, 20, 10, 2031),
    tx(9, 77, 10),
  ];
  const plan = buildPlan(settings, profiles, workbookLines);
  const monitor = buildMonitor(settings, plan, workbookLines, transactions);

  it("reproduces the per-line pre-tax balances (column E) and B7/B8", () => {
    const balance = (id: number) => monitor.lines.get(id)!.cells[0]!.balanceBeforeTax;
    expect(balance(11)).toBe(20000n);
    expect(balance(12)).toBe(2000n);
    expect(balance(13)).toBe(0n);
    expect(balance(19)).toBe(400000n);
    expect(balance(20)).toBe(0n);
    expect(monitor.total.total.spentBeforeTax).toBe(1713000n);
    expect(monitor.total.total.balanceBeforeTax).toBe(422000n);
  });

  it("costs each invoice with its own captured rate", () => {
    expect(transactionCost(tx(4, 19, 5000))).toBe(528440n);
    const training = monitor.lines.get(20)!.total;
    expect(training.spent).toBe(634128n);
    expect(training.balance).toBe(-1n);
    expect(training.status).toBe("low");
  });

  it("flags lines by the workbook's 10 % rule", () => {
    const status = (id: number) => monitor.lines.get(id)!.cells[0]!.status;
    expect(status(11)).toBe("ok");
    expect(status(12)).toBe("low");
    expect(status(19)).toBe("ok");
    expect(monitor.lines.get(11)!.cells[1]!.status).toBe("idle");
  });

  it("lists transactions it cannot place instead of counting them", () => {
    expect(monitor.uncounted).toEqual([8, 9]);
  });

  it("rolls sections up", () => {
    expect(monitor.sections.capital.total.spentBeforeTax).toBe(1100000n);
    expect(monitor.sections.capital.cells[0]!.balanceBeforeTax).toBe(400000n);
    expect(monitor.sections.other.total.status).toBe("idle");
  });

  it("classifies every status", () => {
    expect(statusOf(0n, 0n, 100000n)).toBe("idle");
    expect(statusOf(0n, 5n, 100000n)).toBe("unbudgeted");
    expect(statusOf(100n, 101n, 100000n)).toBe("over");
    expect(statusOf(100n, 90n, 100000n)).toBe("low");
    expect(statusOf(100n, 89n, 100000n)).toBe("ok");
    expect(statusOf(-100n, 0n, 100000n)).toBe("over");
  });
});
