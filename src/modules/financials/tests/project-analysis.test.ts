import { describe, expect, it } from "vitest";
import {
  businessCase,
  cashFlowRoi,
  costBuildUp,
  deliveryForecast,
  estimateConfidence,
  normalCdf,
  normalQuantile,
  parseSeries,
  resourceLevel,
  riskExposure,
} from "@/modules/financials/calc/project-analysis";
import { toIsoDate } from "@/modules/financials/calc/project-math";
import type { RiskRow } from "@/modules/financials/calc/project-analysis";

describe("normalQuantile", () => {
  it("matches the standard z-table", () => {
    expect(normalQuantile(0.5)).toBeCloseTo(0, 9);
    expect(normalQuantile(0.9)).toBeCloseTo(1.28155, 4);
    expect(normalQuantile(0.95)).toBeCloseTo(1.64485, 4);
    expect(normalQuantile(0.975)).toBeCloseTo(1.95996, 4);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.95996, 4);
    expect(normalQuantile(0.99)).toBeCloseTo(2.32635, 4);
  });

  it("rejects impossible probabilities", () => {
    expect(() => normalQuantile(0)).toThrow();
    expect(() => normalQuantile(1)).toThrow();
  });
});

describe("normalCdf", () => {
  it("matches the standard normal distribution", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.84134, 5);
    expect(normalCdf(-1)).toBeCloseTo(0.15866, 5);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
  });
});

describe("estimateConfidence", () => {
  const result = estimateConfidence({ expected: 8.5, sd: 1.5, target: 10 });

  it("derives the confidence bounds", () => {
    expect(result).not.toBeNull();
    expect(result?.p50).toBeCloseTo(8.5, 6);
    expect(result?.p80).toBeCloseTo(9.7624, 3);
    expect(result?.p90).toBeCloseTo(10.4224, 3);
    expect(result?.p95).toBeCloseTo(10.9673, 3);
  });

  it("converts a target into a probability", () => {
    expect(result?.probability).toBeCloseTo(84.13, 1);
  });

  it("omits the probability without a target", () => {
    expect(estimateConfidence({ expected: 8.5, sd: 1.5 })?.probability).toBeNull();
  });

  it("returns null when the inputs are unusable", () => {
    expect(estimateConfidence({ expected: "", sd: 1.5 })).toBeNull();
    expect(estimateConfidence({ expected: 8.5, sd: "" })).toBeNull();
  });
});

describe("riskExposure", () => {
  const rows: RiskRow[] = [
    { id: 1, label: "Vendor", probability: "30", impact: "-20000" },
    { id: 2, label: "Rework", probability: "20", impact: "-35000" },
    { id: 3, label: "Reuse", probability: "40", impact: "12000" },
  ];

  it("values each risk and nets the register", () => {
    const summary = riskExposure(rows);
    expect(summary.emvById[1]).toBeCloseTo(-6000, 6);
    expect(summary.emvById[3]).toBeCloseTo(4800, 6);
    expect(summary.threats).toBeCloseTo(-13000, 6);
    expect(summary.opportunities).toBeCloseTo(4800, 6);
    expect(summary.net).toBeCloseTo(-8200, 6);
    expect(summary.contingency).toBeCloseTo(13000, 6);
    expect(summary.counted).toBe(3);
  });

  it("skips rows that are not fully entered", () => {
    const summary = riskExposure([
      ...rows,
      { id: 4, label: "Blank", probability: "", impact: "-500" },
    ]);
    expect(summary.emvById[4]).toBeNull();
    expect(summary.counted).toBe(3);
    expect(summary.net).toBeCloseTo(-8200, 6);
  });

  it("handles an empty register", () => {
    const summary = riskExposure([]);
    expect(summary.net).toBe(0);
    expect(summary.contingency).toBe(0);
  });
});

describe("deliveryForecast", () => {
  it("turns velocity into sprints and a working-day finish", () => {
    const forecast = deliveryForecast({
      velocity: 25,
      backlog: 130,
      sprintWeeks: 2,
      start: "2026-11-06",
    });

    expect(forecast.sprints).toBe(6);
    expect(forecast.weeks).toBe(12);
    expect(forecast.velocityPerWeek).toBeCloseTo(12.5, 6);
    expect(forecast.finishMs).not.toBeNull();
    // 6 sprints × 2 weeks = 60 working days, starting Fri 6 Nov 2026:
    // Nov 6 is day 1, so the 60th working day is Thu 28 Jan 2027.
    expect(toIsoDate(forecast.finishMs as number)).toBe("2027-01-28");
  });

  it("works out the velocity a deadline demands", () => {
    const forecast = deliveryForecast({
      velocity: 25,
      backlog: 130,
      sprintWeeks: 2,
      start: "2026-11-06",
      target: "2027-01-28",
    });

    // 60 working days inclusive of both ends = 12 weeks = 6 two-week sprints
    expect(forecast.weeksAvailable).toBeCloseTo(12, 6);
    expect(forecast.requiredVelocity).toBeCloseTo(130 / 6, 4);
  });

  it("returns nulls for unusable input", () => {
    const forecast = deliveryForecast({
      velocity: 0,
      backlog: 130,
      sprintWeeks: 2,
      start: "2026-11-06",
    });
    expect(forecast.sprints).toBeNull();
    expect(forecast.finishMs).toBeNull();
  });
});

describe("businessCase", () => {
  const result = businessCase({ initial: 100000, rate: 10, flows: [50000, 50000, 50000] });

  it("discounts the cash flows", () => {
    expect(result.npv).toBeCloseTo(24342.6, 1);
    expect(result.discounted[0]).toBeCloseTo(45454.55, 1);
    expect(result.totalReturn).toBe(50000);
  });

  it("solves the IRR and the payback", () => {
    expect(result.irr).not.toBeNull();
    expect(result.irr as number).toBeGreaterThan(23.2);
    expect(result.irr as number).toBeLessThan(23.5);
    expect(result.paybackYears).toBeCloseTo(2, 6);
  });

  it("reports no IRR when the flows never recover the outlay", () => {
    const sunk = businessCase({ initial: 100000, rate: 10, flows: [0, 0, 0] });
    expect(sunk.npv).toBe(-100000);
    expect(sunk.irr).toBeNull();
    expect(sunk.paybackYears).toBeNull();
  });

  it("returns nulls when an input is missing", () => {
    expect(businessCase({ initial: "", rate: 10, flows: [1] }).npv).toBeNull();
    expect(businessCase({ initial: 1, rate: 10, flows: [""] }).npv).toBeNull();
  });
});

describe("costBuildUp", () => {
  it("adds overhead and contingency on top of labour", () => {
    const cost = costBuildUp({
      hours: 120,
      rate: 65,
      people: 2,
      overheadPct: 15,
      contingencyPct: 10,
      units: 4,
    });

    expect(cost.labour).toBeCloseTo(15600, 6);
    expect(cost.overhead).toBeCloseTo(2340, 6);
    expect(cost.subtotal).toBeCloseTo(17940, 6);
    expect(cost.contingency).toBeCloseTo(1794, 6);
    expect(cost.total).toBeCloseTo(19734, 6);
    expect(cost.perUnit).toBeCloseTo(4933.5, 6);
  });

  it("defaults people to one and the percentages to zero", () => {
    const cost = costBuildUp({
      hours: 10,
      rate: 20,
      people: "",
      overheadPct: "",
      contingencyPct: "",
      units: "",
    });
    expect(cost.total).toBeCloseTo(200, 6);
    expect(cost.perUnit).toBeNull();
  });

  it("returns nulls without hours or rate", () => {
    expect(
      costBuildUp({ hours: "", rate: 65, people: 2, overheadPct: 0, contingencyPct: 0, units: 1 })
        .total,
    ).toBeNull();
  });
});

describe("cashFlowRoi", () => {
  const rows = [
    { id: 1, inflow: "15000", outflow: "5000" },
    { id: 2, inflow: "20000", outflow: "6000" },
    { id: 3, inflow: "28000", outflow: "7000" },
    { id: 4, inflow: "35000", outflow: "8000" },
    { id: 5, inflow: "42000", outflow: "8000" },
    { id: 6, inflow: "50000", outflow: "9000" },
  ];
  const flow = cashFlowRoi({ initial: "120000", rows });

  it("builds the net cash and cumulative balance for each period", () => {
    expect(flow.rows.map((row) => row.net)).toEqual([10000, 14000, 21000, 27000, 34000, 41000]);
    expect(flow.rows[0].cumulative).toBe(-110000);
    expect(flow.rows[5].cumulative).toBe(27000);
  });

  it("totals the flows and the cash-on-cash ROI", () => {
    expect(flow.inflowTotal).toBe(190000);
    expect(flow.outflowTotal).toBe(43000);
    expect(flow.netTotal).toBe(147000);
    expect(flow.roi).toBeCloseTo(22.5, 6);
    expect(flow.finalPosition).toBe(27000);
  });

  it("finds the deepest funding point and the break-even period", () => {
    // The outlay itself is the deepest point: period 1 already recovers 10,000.
    expect(flow.peakFunding).toBe(-120000);
    expect(flow.breakevenPeriod).toBe(6);
    expect(flow.positivePeriods).toBe(1);
  });

  it("reports no break-even when the project never pays back", () => {
    const slow = cashFlowRoi({
      initial: "500000",
      rows: [
        { id: 1, inflow: "10000", outflow: "0" },
        { id: 2, inflow: "10000", outflow: "0" },
      ],
    });
    expect(slow.breakevenPeriod).toBeNull();
    expect(slow.positivePeriods).toBe(0);
    expect(slow.roi).toBeCloseTo(-96, 6);
    expect(slow.peakFunding).toBe(-500000);
  });

  it("treats a blank period as zero cash and guards a missing outlay", () => {
    const blanks = cashFlowRoi({
      initial: "1000",
      rows: [
        { id: 1, inflow: "", outflow: "" },
        { id: 2, inflow: "500", outflow: "100" },
      ],
    });
    expect(blanks.rows[0].net).toBe(0);
    expect(blanks.rows[0].cumulative).toBe(-1000);
    expect(blanks.finalPosition).toBe(-600);
    expect(cashFlowRoi({ initial: "", rows }).roi).toBeNull();
  });
});

describe("parseSeries", () => {
  it("accepts commas, spaces and negatives", () => {
    expect(parseSeries("6, 9, 4, 11, 7")).toEqual([6, 9, 4, 11, 7]);
    expect(parseSeries("6 9 4")).toEqual([6, 9, 4]);
    expect(parseSeries("2.5, -1")).toEqual([2.5, -1]);
    expect(parseSeries("")).toEqual([]);
  });
});

describe("resourceLevel", () => {
  const result = resourceLevel({ demand: "6, 9, 4, 11, 7", capacity: "8" });

  it("summarises the demand curve", () => {
    expect(result.periods).toBe(5);
    expect(result.total).toBe(37);
    expect(result.average).toBeCloseTo(7.4, 6);
    expect(result.peak).toBe(11);
    expect(result.peakPeriod).toBe(4);
    expect(result.utilisation).toBeCloseTo(92.5, 6);
  });

  it("flags the overloaded periods and the worst overload", () => {
    expect(result.overloaded).toEqual([2, 4]);
    expect(result.worstOverload).toBe(3);
  });

  it("levels by spilling the overload forward", () => {
    expect(result.levelled).toEqual([6, 8, 5, 8, 8, 2]);
    expect(result.levelledPeriods).toBe(6);
    expect(result.extraPeriods).toBe(1);
    expect(result.capacityForSameSpan).toBe(8);
  });

  it("needs no levelling when demand fits", () => {
    const calm = resourceLevel({ demand: "4, 5, 3", capacity: "8" });
    expect(calm.overloaded).toEqual([]);
    expect(calm.extraPeriods).toBe(0);
    expect(calm.levelled).toEqual([4, 5, 3]);
  });

  it("raises the flat capacity when the total exceeds a flat plan", () => {
    // 37 units over 5 periods cannot be done at 8 per period, so 8 is the floor
    // and the real requirement is ceil(37 / 5) = 8 — with the peak still at 11.
    const tight = resourceLevel({ demand: "10, 10, 10", capacity: "12" });
    expect(tight.capacityForSameSpan).toBe(10);
    expect(tight.worstOverload).toBe(0);
  });

  it("degrades gracefully without a capacity", () => {
    const bare = resourceLevel({ demand: "6, 9", capacity: "" });
    expect(bare.utilisation).toBeNull();
    expect(bare.levelledPeriods).toBeNull();
    expect(bare.total).toBe(15);
  });
});
