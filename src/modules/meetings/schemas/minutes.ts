import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import type {
  MeetingWorkspace,
  RosterEntry,
  WorkspaceActionItem,
  WorkspaceAgendaItem,
  WorkspaceDiscussionPoint,
} from "./meeting";

/**
 * The minutes as the workspace edits and prints them (ADR-0028, Access
 * Meeting → Agenda → Discussion points → Action items). Pure, DOM-free
 * helpers so Vitest covers them; the components only render.
 */

export interface PointNode {
  point: WorkspaceDiscussionPoint;
  actions: WorkspaceActionItem[];
}

export interface AgendaNode {
  item: WorkspaceAgendaItem;
  points: PointNode[];
  /** Actions directly under the agenda item (no discussion point). */
  actions: WorkspaceActionItem[];
}

const bySortOrder =
  <T extends { SortOrder: number }>(id: (row: T) => number) =>
  (a: T, b: T) =>
    a.SortOrder - b.SortOrder || id(a) - id(b);

/**
 * The agenda in order, each item with its discussion points and actions in
 * order. Children of a parent the workspace does not hold are left out.
 */
export function buildMinutes(
  workspace: Pick<MeetingWorkspace, "agendaItems" | "discussionPoints" | "actionItems">,
): AgendaNode[] {
  const agenda = new Map<number, AgendaNode>();
  for (const item of [...workspace.agendaItems].sort(bySortOrder((a) => a.MeetingAgendaItemId))) {
    agenda.set(item.MeetingAgendaItemId, { item, points: [], actions: [] });
  }
  const points = new Map<number, PointNode>();
  for (const point of [...workspace.discussionPoints].sort(
    bySortOrder((p) => p.MeetingDiscussionPointId),
  )) {
    const parent = agenda.get(point.AgendaItemId);
    if (!parent) continue;
    const node = { point, actions: [] };
    parent.points.push(node);
    points.set(point.MeetingDiscussionPointId, node);
  }
  for (const action of [...workspace.actionItems].sort(bySortOrder((a) => a.MeetingActionItemId))) {
    if (action.DiscussionPointId != null) {
      points.get(action.DiscussionPointId)?.actions.push(action);
    } else if (action.AgendaItemId != null) {
      agenda.get(action.AgendaItemId)?.actions.push(action);
    }
  }
  return [...agenda.values()];
}

export interface Sibling {
  id: number;
  rowVer: number;
}

/**
 * The order a reorder proc takes after moving one sibling a place up (-1) or
 * down (+1): every sibling once, at the RowVer the client read. Null when the
 * item is already first or last, or is not among the siblings.
 */
export function moveOrder(siblings: Sibling[], id: number, step: -1 | 1): Sibling[] | null {
  const from = siblings.findIndex((s) => s.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= siblings.length) return null;
  const order = siblings.map((s) => ({ id: s.id, rowVer: s.rowVer }));
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order;
}

export const agendaSiblings = (nodes: AgendaNode[]): Sibling[] =>
  nodes.map((n) => ({ id: n.item.MeetingAgendaItemId, rowVer: n.item.RowVer }));

export const pointSiblings = (nodes: PointNode[]): Sibling[] =>
  nodes.map((n) => ({ id: n.point.MeetingDiscussionPointId, rowVer: n.point.RowVer }));

export const actionSiblings = (actions: WorkspaceActionItem[]): Sibling[] =>
  actions.map((a) => ({ id: a.MeetingActionItemId, rowVer: a.RowVer }));

/** Today as "YYYY-MM-DD" on the server's calendar, so server and browser agree. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Every action counts as open (no completion field, ADR-0028 §4); overdue once its due date has passed. */
export function isOverdue(dueDate: string | null, today: string): boolean {
  return dueDate != null && dueDate < today;
}

export interface OpenAction {
  action: WorkspaceActionItem;
  overdue: boolean;
}

/** The meeting's open actions by due date, earliest first, undated last. */
export function openActions(actions: WorkspaceActionItem[], today: string): OpenAction[] {
  return [...actions]
    .sort((a, b) => {
      if (a.DueDate === b.DueDate) return a.MeetingActionItemId - b.MeetingActionItemId;
      if (a.DueDate == null) return 1;
      if (b.DueDate == null) return -1;
      return a.DueDate < b.DueDate ? -1 : 1;
    })
    .map((action) => ({ action, overdue: isOverdue(action.DueDate, today) }));
}

/**
 * Who can be made responsible for an action (checklist row 13): the live
 * stakeholders of the meeting's project, from the participant roster. A
 * current person responsible who is no longer one stays on offer, so saving
 * the action's text keeps them (the proc checks the person only on a change).
 */
export function personOptions(
  roster: RosterEntry[],
  current?: { id: number | null; name: string | null },
): StakeholderOption[] {
  const options = roster
    .filter((entry) => !entry.IsHistorical)
    .map((entry) => ({ stakeholderId: entry.StakeholderId, name: entry.Label }));
  if (current?.id != null && !options.some((o) => o.stakeholderId === current.id)) {
    options.push({ stakeholderId: current.id, name: current.name || String(current.id) });
  }
  return options;
}

/**
 * The RowVer an inline edit saves with. A change elsewhere that left the
 * fields being edited as they were (a reorder renumbers the siblings) moves
 * to the newer RowVer; any other change keeps the one the edit started from,
 * so the save is a CONFLICT instead of overwriting it.
 */
export function editRowVer<T extends { RowVer: number }>(
  started: T,
  current: T | undefined,
  same: (a: T, b: T) => boolean,
): number {
  return current && same(started, current) ? current.RowVer : started.RowVer;
}

export const sameAgendaItem = (a: WorkspaceAgendaItem, b: WorkspaceAgendaItem) =>
  a.AgendaItem === b.AgendaItem;

export const samePoint = (a: WorkspaceDiscussionPoint, b: WorkspaceDiscussionPoint) =>
  a.DiscussionPoint === b.DiscussionPoint;

export const sameAction = (a: WorkspaceActionItem, b: WorkspaceActionItem) =>
  a.Action === b.Action &&
  a.AssignedToStakeholderId === b.AssignedToStakeholderId &&
  a.DueDate === b.DueDate;

/** An item's text, cut to fit the accessible name of its buttons ("Move Budget up"). */
export function itemName(text: string | null, fallback: string): string {
  const plain = (text ?? "").replace(/\s+/g, " ").trim();
  if (!plain) return fallback;
  return plain.length > 40 ? `${plain.slice(0, 39)}…` : plain;
}
