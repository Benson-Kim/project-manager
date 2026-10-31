import { toDateInput } from "@/lib/format";
import { MOSCOW, isMoSCoW, type MoSCoW } from "@/modules/requirements/schemas/moscow";
import type { BoardCardListRow } from "./board-card";
import { cardLabel } from "./board-rules";

/**
 * The Kanban read of a board (ADR-0052): what kind each card is, how healthy its requirements
 * are, the board's totals, the client-side filters and the JSON copy. Pure, so Vitest covers it;
 * the server's search (usp_Board_GetBoard @Search) stays the text filter.
 */

export const CARD_KINDS = ["deliverable", "requirement", "free"] as const;

export type CardKind = (typeof CARD_KINDS)[number];

type KindSource = Pick<BoardCardListRow, "RequirementState" | "DeliverableState">;

/** A card carries at most one source (CK_BoardCard_Content); a redacted source still counts. */
export function cardKind(card: KindSource): CardKind {
  if (card.DeliverableState !== "none") return "deliverable";
  if (card.RequirementState !== "none") return "requirement";
  return "free";
}

export interface Tally {
  done: number;
  total: number;
}

export interface MoscowCount {
  code: MoSCoW;
  count: number;
}

export interface CardHealth {
  /** The must-have requirements, met of all; null when the card has none to count. */
  must: Tally | null;
  /** Every requirement the card carries, met of all; null when it carries none. */
  met: Tally | null;
  /** How many requirements carry each MoSCoW code, in M, S, C, W order; absent codes left out. */
  moscow: MoscowCount[];
}

type HealthSource = Pick<
  BoardCardListRow,
  | "RequirementState"
  | "RequirementIsMet"
  | "RequirementMoSCoW"
  | "DeliverableState"
  | "DeliverableRequirementCount"
  | "DeliverableMetCount"
  | "DeliverableMustCount"
  | "DeliverableMustMetCount"
  | "DeliverableShouldCount"
  | "DeliverableCouldCount"
  | "DeliverableWontCount"
>;

const NO_HEALTH: CardHealth = { must: null, met: null, moscow: [] };

function deliverableMoscow(card: HealthSource): MoscowCount[] {
  const counts: Record<MoSCoW, number | null> = {
    M: card.DeliverableMustCount,
    S: card.DeliverableShouldCount,
    C: card.DeliverableCouldCount,
    W: card.DeliverableWontCount,
  };
  return MOSCOW.map((code) => ({ code, count: counts[code] ?? 0 })).filter((p) => p.count > 0);
}

/** Only a live source is counted: a restricted or removed one has nothing the reader may see. */
export function cardHealth(card: HealthSource): CardHealth {
  if (card.DeliverableState === "live") {
    const total = card.DeliverableRequirementCount ?? 0;
    const mustTotal = card.DeliverableMustCount ?? 0;
    return {
      // Always counted, 0/0 included, as the prototype card always shows both.
      must: { done: card.DeliverableMustMetCount ?? 0, total: mustTotal },
      met: { done: card.DeliverableMetCount ?? 0, total },
      moscow: deliverableMoscow(card),
    };
  }
  if (card.RequirementState === "live") {
    const done = card.RequirementIsMet ? 1 : 0;
    const moscow = card.RequirementMoSCoW;
    return {
      must: moscow === "M" ? { done, total: 1 } : null,
      met: { done, total: 1 },
      moscow: moscow ? [{ code: moscow, count: 1 }] : [],
    };
  }
  return NO_HEALTH;
}

export function tallyPercent(tally: Tally | null): number | null {
  return tally && tally.total ? Math.round((tally.done / tally.total) * 100) : null;
}

export interface KanbanStats {
  cards: number;
  /** Must-haves met across the shown cards, as a percentage; null when there are none. */
  mustHealth: number | null;
  /** Cards whose deliverable has the priority list's first option. */
  topPriority: number;
}

type StatsSource = HealthSource & Pick<BoardCardListRow, "DeliverablePriority">;

export function kanbanStats(
  cards: readonly StatsSource[],
  topPriority: string | null,
): KanbanStats {
  const must = cards.reduce<Tally>(
    (sum, card) => {
      const m = cardHealth(card).must;
      return m ? { done: sum.done + m.done, total: sum.total + m.total } : sum;
    },
    { done: 0, total: 0 },
  );
  return {
    cards: cards.length,
    mustHealth: tallyPercent(must),
    topPriority: topPriority
      ? cards.filter((c) => c.DeliverableState === "live" && c.DeliverablePriority === topPriority)
          .length
      : 0,
  };
}

type PlaceSource = Pick<BoardCardListRow, "BoardCardId" | "BoardColumnId" | "BoardSprintId">;

/** A drop on the board: the lane's data-drag-lane ("backlog" for no sprint) and the card after the gap. */
export interface CardDrop {
  itemId: number;
  lane: string;
  beforeId?: number;
}

export interface CardPlacement {
  cardId: number;
  columnId: number;
  sprintId: number | null;
  beforeId?: number;
}

/**
 * Where a drop puts a card. The board's lanes are columns; the plan's are sprints, where the card
 * keeps its column and goes before a card of that same column only, as the server orders cards
 * within one column.
 */
export function dropPlacement(
  cards: readonly PlaceSource[],
  drop: CardDrop,
  planning: boolean,
): CardPlacement | null {
  const card = cards.find((c) => c.BoardCardId === drop.itemId);
  const lane = drop.lane === "backlog" ? null : Number(drop.lane);
  if (!card || (lane !== null && !Number.isInteger(lane)) || (!planning && lane === null))
    return null;
  const before = cards.find((c) => c.BoardCardId === drop.beforeId);
  return {
    cardId: card.BoardCardId,
    columnId: planning ? card.BoardColumnId : (lane as number),
    sprintId: planning ? lane : card.BoardSprintId,
    beforeId:
      before && (!planning || before.BoardColumnId === card.BoardColumnId)
        ? before.BoardCardId
        : undefined,
  };
}

/** The cards with one moved to its placement: before `beforeId`, or last in its lane. */
export function placeCard<T extends PlaceSource>(
  cards: readonly T[],
  placement: CardPlacement,
): T[] {
  const card = cards.find((c) => c.BoardCardId === placement.cardId);
  if (!card) return [...cards];
  const moved = { ...card, BoardColumnId: placement.columnId, BoardSprintId: placement.sprintId };
  const rest = cards.filter((c) => c !== card);
  const at = rest.findIndex((c) => c.BoardCardId === placement.beforeId);
  return at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** The cards lane by lane as the view draws them; two equal strings mean nothing moved. */
export function laneOrder(cards: readonly PlaceSource[], planning: boolean): string {
  const lanes = new Map<string, number[]>();
  for (const card of cards) {
    const lane = String(planning ? card.BoardSprintId : card.BoardColumnId);
    lanes.set(lane, [...(lanes.get(lane) ?? []), card.BoardCardId]);
  }
  return [...lanes]
    .map(([lane, ids]) => `${lane}:${ids.join(",")}`)
    .sort()
    .join("|");
}

export const ALL = "all";

export interface KanbanFilter {
  kind: CardKind | typeof ALL;
  moscow: MoSCoW | typeof ALL;
  priority: string;
}

export const NO_KANBAN_FILTER: KanbanFilter = { kind: ALL, moscow: ALL, priority: ALL };

export function isKanbanFiltering(filter: KanbanFilter): boolean {
  return filter.kind !== ALL || filter.moscow !== ALL || filter.priority !== ALL;
}

/** Reads a select's value back into the filter, so a stale or forged value falls back to "all". */
export function kanbanFilterOf(kind: string, moscow: string, priority: string): KanbanFilter {
  return {
    kind: (CARD_KINDS as readonly string[]).includes(kind) ? (kind as CardKind) : ALL,
    moscow: isMoSCoW(moscow) ? moscow : ALL,
    priority: priority.trim() ? priority : ALL,
  };
}

/** A priority filter matches live deliverable cards only: nothing else carries a priority. */
export function kanbanShows(card: StatsSource, filter: KanbanFilter): boolean {
  if (filter.kind !== ALL && cardKind(card) !== filter.kind) return false;
  if (filter.moscow !== ALL && !cardHealth(card).moscow.some((p) => p.code === filter.moscow))
    return false;
  if (
    filter.priority !== ALL &&
    !(card.DeliverableState === "live" && card.DeliverablePriority === filter.priority)
  )
    return false;
  return true;
}

export interface KanbanJsonContext {
  columns: ReadonlyMap<number, string>;
  sprints: ReadonlyMap<number, string>;
  assignees: ReadonlyMap<number, string>;
}

/**
 * The "Copy board data" export (JSON): the shown cards as the board draws them. It is built
 * from the list rows, which the server has already redacted, so a restricted card exports its
 * label only.
 */
export function kanbanJson(cards: readonly BoardCardListRow[], context: KanbanJsonContext): string {
  const rows = cards.map((card) => {
    const health = cardHealth(card);
    const deliverable = card.DeliverableState === "live";
    const requirement = card.RequirementState === "live";
    return {
      id: card.BoardCardId,
      title: cardLabel(card),
      kind: cardKind(card),
      column: context.columns.get(card.BoardColumnId) ?? null,
      sprint: card.BoardSprintId ? (context.sprints.get(card.BoardSprintId) ?? null) : null,
      reference: requirement ? card.RequirementRef : null,
      deliverable: deliverable ? card.DeliverableTitle : null,
      status: deliverable ? card.DeliverableStatus : null,
      priority: deliverable ? card.DeliverablePriority : null,
      moscow: Object.fromEntries(health.moscow.map((p) => [p.code, p.count])),
      mustHaves: health.must,
      met: health.met,
      assignee: card.AssigneeUserId ? (context.assignees.get(card.AssigneeUserId) ?? null) : null,
      due: toDateInput(card.DueDate) || null,
      points: card.StoryPoints,
    };
  });
  return JSON.stringify(rows, null, 2);
}

export type ColumnCategory = "todo" | "doing" | "done";
export type LaneTone = "gray" | "blue" | "orange" | "purple" | "green";

const DOING_TONES = ["blue", "orange", "purple"] as const;

/**
 * Each column's top colour, one per stage: waiting columns gray, done green,
 * and the working columns in between blue, orange and purple in turn.
 */
export function columnTones(categories: readonly ColumnCategory[]): LaneTone[] {
  let doing = 0;
  return categories.map((category) => {
    if (category === "todo") return "gray";
    if (category === "done") return "green";
    return DOING_TONES[doing++ % DOING_TONES.length];
  });
}
