import { messages } from "@/lib/messages";

const S = messages.stakeholders;

export const STANCES = ["Champion", "Supporter", "Neutral", "Critic", "Blocker"] as const;
export type Stance = (typeof STANCES)[number];

/** Support each stance adds to the alignment index, 0 to 1. */
export const STANCE_WEIGHT: Record<Stance, number> = {
  Champion: 1,
  Supporter: 0.8,
  Neutral: 0.5,
  Critic: 0.2,
  Blocker: 0,
};

export function isStance(value: unknown): value is Stance {
  return typeof value === "string" && (STANCES as readonly string[]).includes(value);
}

/** Reading order: top-left, top-right, bottom-left, bottom-right. */
export const QUADRANTS = ["satisfied", "manage", "monitor", "informed"] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export const HIGH = 50;

/** Power is the vertical axis, interest the horizontal one. */
export function quadrantOf(power: number, interest: number): Quadrant {
  if (power >= HIGH) return interest >= HIGH ? "manage" : "satisfied";
  return interest >= HIGH ? "informed" : "monitor";
}

/** Clamps to 0-100 and rounds to the grid's step of five. */
export function snap(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value / 5) * 5));
}

const STOP_WORDS = new Set(["of", "the", "and", "for", "to", "a", "an", "&"]);

/** "Head of Product" -> "HP", "Legal & Compliance" -> "LC". */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word[0] ?? ""));
  const meaningful = words.filter((word) => !STOP_WORDS.has(word.toLowerCase()));
  const letters = (meaningful.length > 0 ? meaningful : words)
    .map((word) => word[0])
    .join("")
    .slice(0, 2);
  return (letters || "?").toUpperCase();
}

export interface MatrixStakeholder {
  id: number;
  name: string;
  role: string;
  stance: Stance | null;
  power: number | null;
  interest: number | null;
  plan: string;
}

export interface PlacedStakeholder extends MatrixStakeholder {
  power: number;
  interest: number;
}

export function isPlaced(row: MatrixStakeholder): row is PlacedStakeholder {
  return row.power !== null && row.interest !== null;
}

/** Drag payload for placing a stakeholder by dropping its list entry onto the grid. */
export const STAKEHOLDER_DRAG_MIME = "application/x-stakeholder-id";

export interface MatrixSummary {
  total: number;
  placed: number;
  byQuadrant: Record<Quadrant, number>;
  byStance: Record<Stance, number>;
  /** Power of HIGH or more, stance Critic or Blocker. */
  detractors: number;
  detractorPower: number;
  /** Power points of every placed stakeholder with a stance: the index's denominator. */
  powerTotal: number;
  detractorShare: number;
  /** Power-weighted support, 0-100, over placed stakeholders with a stance. */
  alignment: number;
  /** High-power stakeholders with no plan written. */
  unplanned: number;
  /** Share of high-power stakeholders that have a plan. */
  coverage: number;
}

/**
 * Each stance becomes a support score (champion 1 to blocker 0) weighted by power, so a lukewarm
 * sponsor moves the index far more than a delighted beta user. A stakeholder with no power or
 * interest is left out; one with no stance counts everywhere except the index.
 */
export function summarise(rows: readonly MatrixStakeholder[]): MatrixSummary {
  const byQuadrant: Record<Quadrant, number> = { satisfied: 0, manage: 0, monitor: 0, informed: 0 };
  const byStance: Record<Stance, number> = {
    Champion: 0,
    Supporter: 0,
    Neutral: 0,
    Critic: 0,
    Blocker: 0,
  };
  const placed = rows.filter(isPlaced);

  let weightTotal = 0;
  let supportTotal = 0;
  let detractors = 0;
  let detractorPower = 0;
  let highPower = 0;
  let plannedHighPower = 0;

  for (const row of placed) {
    byQuadrant[quadrantOf(row.power, row.interest)] += 1;
    if (row.stance) {
      byStance[row.stance] += 1;
      const weight = Math.max(row.power, 1);
      weightTotal += weight;
      supportTotal += weight * STANCE_WEIGHT[row.stance];
    }
    if (row.power >= HIGH) {
      highPower += 1;
      if (row.plan.trim() !== "") plannedHighPower += 1;
      if (row.stance === "Critic" || row.stance === "Blocker") {
        detractors += 1;
        detractorPower += row.power;
      }
    }
  }

  return {
    total: rows.length,
    placed: placed.length,
    byQuadrant,
    byStance,
    detractors,
    detractorPower,
    powerTotal: weightTotal,
    detractorShare: weightTotal > 0 ? (detractorPower / weightTotal) * 100 : 0,
    alignment: weightTotal > 0 ? (supportTotal / weightTotal) * 100 : 0,
    unplanned: highPower - plannedHighPower,
    coverage: highPower > 0 ? (plannedHighPower / highPower) * 100 : 100,
  };
}

const csvCell = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;

/** RFC 4180 CSV of the whole register, placed or not, for the clipboard. */
export function toCsv(rows: readonly MatrixStakeholder[]): string {
  const header = [
    S.name,
    S.projectRole,
    S.stance,
    S.power,
    S.interest,
    S.matrix.quadrant,
    S.keyMessageStrategy,
  ];
  const body = rows.map((row) =>
    [
      row.name,
      row.role,
      row.stance ? S.stances[row.stance] : "",
      row.power,
      row.interest,
      isPlaced(row) ? S.matrix.quadrants[quadrantOf(row.power, row.interest)] : "",
      row.plan,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...body].join("\n");
}
