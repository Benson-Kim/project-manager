"use client";

import { createContext, useContext } from "react";
import type { ActionResult } from "@/lib/action";
import type { GovernanceLogKind } from "../governance-logs";
import type {
  ActionStatus,
  MeetingWorkspace,
  WorkspaceActionItem,
  WorkspaceDiscussionPoint,
  WorkspaceSection,
} from "../schemas/meeting";
import type { Sibling } from "../schemas/minutes";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";

export type MinutesAnswer = ActionResult<MeetingWorkspace | null>;

/** A reorder the editor sends: the siblings' new order, under their parent. */
export type MoveRequest =
  | { kind: "agenda" }
  | { kind: "point"; agendaItemId: number }
  | { kind: "action"; agendaItemId: number; discussionPointId: number | null }
  | { kind: "followUp"; meetingActionItemId: number };

export interface DeleteTarget {
  kind: "agenda" | "point" | "action" | "followUp" | "section";
  id: number;
  rowVer: number;
  name: string;
}

/** Who a person picker offers, plus the one already picked so a save keeps them. */
export interface PickedPerson {
  id: number | null;
  name: string | null;
}

export interface MinutesContextValue {
  meetingId: number;
  projectId: number;
  /** A person picker may create a stakeholder in place (stakeholders:create). */
  canAddStakeholder: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** A move or a delete is on its way: other moves and deletes wait. */
  busy: boolean;
  /** Takes a saved change's answer; `refresh` also re-renders the server's rich-text views. */
  answer: (workspace: MeetingWorkspace | null, refresh?: boolean) => void;
  move: (request: MoveRequest, siblings: Sibling[], id: number, step: -1 | 1, key: string) => void;
  askDelete: (target: DeleteTarget) => void;
  /** Focuses the element with this data-focus-key once the next render lands. */
  focusSoon: (key: string) => void;
  pointView: (point: WorkspaceDiscussionPoint) => React.ReactNode;
  sectionView: (section: WorkspaceSection) => React.ReactNode;
  /** The renamed built-in sections and the boxes users added. */
  sections: readonly WorkspaceSection[];
  people: (current?: PickedPerson) => StakeholderOption[];
  /**
   * Moves one action to a status (ADR-0043), from its own row or a carried-over
   * one. Asking for the hold asks for its reason first (ADR-0044): the editor
   * opens the dialog and writes the status and the reason together, so the rows
   * only report the pick and the reason cannot be left to a second write that
   * may never happen. `current` is the reason the action already carries, which
   * is what the dialog opens with when a hold is being changed.
   */
  setStatus: (
    id: number,
    rowVer: number,
    status: ActionStatus,
    name: string,
    current?: string | null,
  ) => void;
  /** Meeting edits and new decision-log entries are both allowed. */
  canLogDecision: boolean;
  /** The project's decision log; a point already logged links to it. */
  decisionsHref: string;
  /** Logs the point in the decision log; a point already logged keeps its decision. */
  logDecision: (point: WorkspaceDiscussionPoint, name: string) => void;
  /** Meeting edits and new assumptions are both allowed. */
  canLogAssumption: boolean;
  /** The project's assumptions and constraints register; a logged point links to its entry. */
  assumptionsHref: string;
  /** Logs the point as an assumption; a point already logged keeps it. */
  logAssumption: (point: WorkspaceDiscussionPoint, name: string) => void;
  /** "YYYY-MM-DD" on the server's calendar: actions due before it are overdue. */
  today: string;
  /** The logs this user may link an action to (create and update in that log). */
  logKinds: readonly GovernanceLogKind[];
  /** Links the action to exactly these logs; an unticked log keeps its record. */
  setLogLinks: (action: WorkspaceActionItem, kinds: GovernanceLogKind[], name: string) => void;
  /** The project's WBS tasks an action may point at; empty when the user may not link them. */
  taskOptions: readonly { id: number; label: string }[];
  /** Points the action at exactly these WBS tasks. */
  setTaskLinks: (action: WorkspaceActionItem, keyDeliverableIds: number[], name: string) => void;
}

export const MinutesContext = createContext<MinutesContextValue | null>(null);

export function useMinutes(): MinutesContextValue {
  const value = useContext(MinutesContext);
  if (!value) throw new Error("useMinutes needs a MinutesEditor");
  return value;
}
