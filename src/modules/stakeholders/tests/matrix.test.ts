import { describe, expect, it } from "vitest";
import {
  initials,
  isStance,
  quadrantOf,
  snap,
  summarise,
  toCsv,
  type MatrixStakeholder,
  type Stance,
} from "../matrix";

const row = (patch: Partial<MatrixStakeholder> = {}): MatrixStakeholder => ({
  id: 1,
  name: "Test",
  role: "",
  stance: "Neutral",
  power: 50,
  interest: 50,
  plan: "",
  ...patch,
});

const seed: [string, string, Stance, number, number, string][] = [
  ["Head of Product", "Executive sponsor", "Champion", 90, 85, "Weekly roadmap review"],
  ["Engineering Lead", "Delivery", "Supporter", 70, 90, "Joint planning each sprint"],
  ["Legal & Compliance", "Risk", "Neutral", 80, 35, "Early review of integrations"],
  ["Finance Director", "Budget owner", "Critic", 85, 30, "Share budget vs. progress monthly"],
  ["Key customer (Acme)", "External", "Supporter", 55, 80, "Quarterly roadmap preview"],
  ["Customer Support", "Internal", "Neutral", 30, 75, "Training before launch"],
  ["Marketing", "Internal", "Supporter", 35, 45, "Launch plan alignment"],
  ["Industry regulator", "External", "Neutral", 60, 15, "Track guidance changes"],
  ["Beta users", "External", "Champion", 15, 85, "Beta feedback channel"],
  ["Procurement", "Internal", "Neutral", 25, 20, ""],
];
const REGISTER = seed.map(([name, role, stance, power, interest, plan], index) =>
  row({ id: index + 1, name, role, stance, power, interest, plan }),
);

describe("quadrantOf", () => {
  it("splits the grid at 50 on both axes", () => {
    expect(quadrantOf(90, 85)).toBe("manage");
    expect(quadrantOf(50, 50)).toBe("manage");
    expect(quadrantOf(80, 35)).toBe("satisfied");
    expect(quadrantOf(50, 49)).toBe("satisfied");
    expect(quadrantOf(30, 75)).toBe("informed");
    expect(quadrantOf(49, 50)).toBe("informed");
    expect(quadrantOf(25, 20)).toBe("monitor");
    expect(quadrantOf(49, 49)).toBe("monitor");
  });
});

describe("snap", () => {
  it("clamps to 0-100 and rounds to steps of five", () => {
    expect(snap(-20)).toBe(0);
    expect(snap(140)).toBe(100);
    expect(snap(62)).toBe(60);
    expect(snap(63)).toBe(65);
    expect(snap(Number.NaN)).toBe(0);
  });
});

describe("initials", () => {
  it("takes the first letter of up to two meaningful words", () => {
    expect(initials("Head of Product")).toBe("HP");
    expect(initials("Beta users")).toBe("BU");
    expect(initials("Legal & Compliance")).toBe("LC");
    expect(initials("Acme")).toBe("A");
    expect(initials("   ")).toBe("?");
  });
});

describe("isStance", () => {
  it("accepts only the five codes", () => {
    expect(isStance("Champion")).toBe(true);
    expect(isStance("Fan")).toBe(false);
    expect(isStance(null)).toBe(false);
  });
});

describe("summarise", () => {
  const summary = summarise(REGISTER);

  it("counts the register by quadrant and stance", () => {
    expect(summary.total).toBe(10);
    expect(summary.placed).toBe(10);
    expect(summary.byQuadrant).toEqual({ manage: 3, satisfied: 3, monitor: 2, informed: 2 });
    expect(summary.byStance).toEqual({
      Champion: 2,
      Supporter: 3,
      Neutral: 4,
      Critic: 1,
      Blocker: 0,
    });
  });

  it("finds the high-power critics and plan coverage", () => {
    expect(summary.detractors).toBe(1);
    expect(summary.detractorPower).toBe(85);
    expect(summary.unplanned).toBe(0);
    expect(summary.coverage).toBe(100);
  });

  it("weights the alignment index by power: 347.5 / 545", () => {
    expect(summary.alignment).toBeCloseTo(63.76, 2);
  });

  it("scores the extremes", () => {
    expect(summarise([row({ stance: "Champion", power: 100 })]).alignment).toBeCloseTo(100, 6);
    expect(summarise([row({ stance: "Blocker", power: 100 })]).alignment).toBeCloseTo(0, 6);
    expect(summarise([row({ stance: "Critic", power: 80 })]).alignment).toBeCloseTo(20, 6);
  });

  it("flags high-power stakeholders with no plan", () => {
    const gap = summarise([
      row({ id: 1, power: 90, plan: "" }),
      row({ id: 2, power: 80, plan: "Monthly call" }),
      row({ id: 3, power: 20, plan: "" }),
    ]);
    expect(gap.unplanned).toBe(1);
    expect(gap.coverage).toBeCloseTo(50, 6);
  });

  it("leaves unplaced rows out, and rows with no stance out of the index only", () => {
    const mixed = summarise([
      row({ id: 1, stance: "Champion", power: 60 }),
      row({ id: 2, stance: null, power: 90, interest: 90 }),
      row({ id: 3, stance: "Blocker", power: null }),
    ]);
    expect(mixed.total).toBe(3);
    expect(mixed.placed).toBe(2);
    expect(mixed.byQuadrant.manage).toBe(2);
    expect(mixed.alignment).toBeCloseTo(100, 6);
    expect(mixed.detractors).toBe(0);
  });

  it("handles an empty register", () => {
    const empty = summarise([]);
    expect(empty.total).toBe(0);
    expect(empty.alignment).toBe(0);
    expect(empty.coverage).toBe(100);
  });
});

describe("toCsv", () => {
  it("writes a quoted header and one row per stakeholder", () => {
    const lines = toCsv(REGISTER.slice(0, 2)).split("\n");
    expect(lines[0]).toBe(
      '"Name","Project role","Stance","Power","Interest","Quadrant","Key message strategy"',
    );
    expect(lines[1]).toBe(
      '"Head of Product","Executive sponsor","Champion","90","85","Manage closely","Weekly roadmap review"',
    );
    expect(lines).toHaveLength(3);
  });

  it("escapes quotes, keeps commas and leaves an unplaced row's cells empty", () => {
    const line = toCsv([
      row({ name: 'Acme, "Big" Co', plan: "Call, then email", stance: null, power: null }),
    ]).split("\n")[1];
    expect(line).toBe('"Acme, ""Big"" Co","","","","50","","Call, then email"');
  });
});
