import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";
import { isOpenStatus } from "./meeting";
import type {
  CarriedOverAction,
  MeetingWorkspace,
  RosterEntry,
  WorkspaceActionItem,
  WorkspaceAgendaItem,
  WorkspaceDiscussionPoint,
  WorkspaceFollowUp,
} from "./meeting";

/**
 * The minutes as the workspace edits and prints them (ADR-0028, Access
 * Meeting → Agenda → Discussion points → Action items, each action with its
 * follow-ups since ADR-0041). Pure, DOM-free helpers so Vitest covers them;
 * the components only render.
 */

export interface ActionNode {
  action: WorkspaceActionItem;
  followUps: WorkspaceFollowUp[];
}

export interface PointNode {
  point: WorkspaceDiscussionPoint;
  actions: ActionNode[];
}

export interface AgendaNode {
  item: WorkspaceAgendaItem;
  points: PointNode[];
  /** Actions directly under the agenda item (no discussion point). */
  actions: ActionNode[];
}

const bySortOrder =
  <T extends { SortOrder: number }>(id: (row: T) => number) =>
  (a: T, b: T) =>
    a.SortOrder - b.SortOrder || id(a) - id(b);

/**
 * The agenda in order, each item with its discussion points, actions and each
 * action's follow-ups in order. Children of a parent the workspace does not
 * hold are left out.
 */
export function buildMinutes(
  workspace: Pick<
    MeetingWorkspace,
    "agendaItems" | "discussionPoints" | "actionItems" | "followUps"
  >,
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
  const actions = new Map<number, ActionNode>();
  for (const action of [...workspace.actionItems].sort(bySortOrder((a) => a.MeetingActionItemId))) {
    const node: ActionNode = { action, followUps: [] };
    if (action.DiscussionPointId != null) {
      if (!points.has(action.DiscussionPointId)) continue;
      points.get(action.DiscussionPointId)?.actions.push(node);
    } else if (action.AgendaItemId != null) {
      if (!agenda.has(action.AgendaItemId)) continue;
      agenda.get(action.AgendaItemId)?.actions.push(node);
    } else continue;
    actions.set(action.MeetingActionItemId, node);
  }
  for (const followUp of [...workspace.followUps].sort(
    bySortOrder((f) => f.MeetingActionFollowUpId),
  )) {
    actions.get(followUp.MeetingActionItemId)?.followUps.push(followUp);
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

export const actionSiblings = (actions: ActionNode[]): Sibling[] =>
  actions.map((a) => ({ id: a.action.MeetingActionItemId, rowVer: a.action.RowVer }));

export const followUpSiblings = (followUps: WorkspaceFollowUp[]): Sibling[] =>
  followUps.map((f) => ({ id: f.MeetingActionFollowUpId, rowVer: f.RowVer }));

/** Today as "YYYY-MM-DD" on the server's calendar, so server and browser agree. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Overdue once its due date has passed. */
export function isOverdue(dueDate: string | null, today: string): boolean {
  return dueDate != null && dueDate < today;
}

export interface OpenAction {
  action: WorkspaceActionItem;
  overdue: boolean;
}

/** By due date, earliest first, undated last; same date, lowest id first. */
const byDueDate =
  <T extends { DueDate: string | null }>(id: (row: T) => number) =>
  (a: T, b: T) => {
    if (a.DueDate === b.DueDate) return id(a) - id(b);
    if (a.DueDate == null) return 1;
    if (b.DueDate == null) return -1;
    return a.DueDate < b.DueDate ? -1 : 1;
  };

/**
 * The meeting's open actions by due date, earliest first, undated last. An
 * action is open until its status is "completed" (ADR-0041); before the status
 * existed every action counted as open, which is what the migration's default
 * keeps true for rows written then.
 */
export function openActions(actions: WorkspaceActionItem[], today: string): OpenAction[] {
  return actions
    .filter((action) => isOpenStatus(action.Status))
    .sort(byDueDate((a) => a.MeetingActionItemId))
    .map((action) => ({ action, overdue: isOverdue(action.DueDate, today) }));
}

export interface CarriedOver {
  action: CarriedOverAction;
  overdue: boolean;
}

/**
 * The unfinished actions this meeting inherits from the project's earlier ones
 * (ADR-0041), by due date, earliest first. The proc has already decided which
 * meetings count as earlier and left out anything completed; this orders what
 * it answered and marks what is overdue. Anything still showing as completed —
 * a row ticked off in another tab between the read and the render — is dropped,
 * so the list never contradicts the status beside it.
 */
export function carriedOverActions(rows: CarriedOverAction[], today: string): CarriedOver[] {
  return rows
    .filter((action) => isOpenStatus(action.Status))
    .sort(byDueDate((a) => a.MeetingActionItemId))
    .map((action) => ({ action, overdue: isOverdue(action.DueDate, today) }));
}

/**
 * Who can be made responsible for an action (checklist row 13): the live
 * stakeholders of the meeting's project, from the participant roster. Guests
 * are not offered, since an action's person responsible is a stakeholder. A
 * current person responsible who is no longer one stays on offer, so saving
 * the action's text keeps them (the proc checks the person only on a change).
 */
export function personOptions(
  roster: RosterEntry[],
  current?: { id: number | null; name: string | null },
): StakeholderOption[] {
  const options: StakeholderOption[] = roster.flatMap((entry) =>
    entry.StakeholderId === null || entry.IsHistorical
      ? []
      : [{ stakeholderId: entry.StakeholderId, name: entry.Label }],
  );
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
  a.DueDate === b.DueDate &&
  a.Status === b.Status;

export const sameFollowUp = (a: WorkspaceFollowUp, b: WorkspaceFollowUp) =>
  a.FollowUp === b.FollowUp &&
  a.AssignedToStakeholderId === b.AssignedToStakeholderId &&
  a.FollowUpDate === b.FollowUpDate &&
  a.DueDate === b.DueDate;

/** An item's text, cut to fit the accessible name of its buttons ("Move Budget up"). */
export function itemName(text: string | null, fallback: string): string {
  const plain = (text ?? "").replace(/\s+/g, " ").trim();
  if (!plain) return fallback;
  return plain.length > 40 ? `${plain.slice(0, 39)}…` : plain;
}
