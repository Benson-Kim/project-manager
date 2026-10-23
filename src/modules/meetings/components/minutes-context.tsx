"use client";

import { createContext, useContext } from "react";
import type { ActionResult } from "@/lib/action";
import type { ActionStatus, MeetingWorkspace, WorkspaceDiscussionPoint } from "../schemas/meeting";
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
  kind: "agenda" | "point" | "action" | "followUp";
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
  people: (current?: PickedPerson) => StakeholderOption[];
  /**
   * Moves one action to a status (ADR-0041), from its own row or a carried-over
   * one. Asking for the hold asks for its reason first (ADR-0042): the editor
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
  /** "YYYY-MM-DD" on the server's calendar: actions due before it are overdue. */
  today: string;
}

export const MinutesContext = createContext<MinutesContextValue | null>(null);

export function useMinutes(): MinutesContextValue {
  const value = useContext(MinutesContext);
  if (!value) throw new Error("useMinutes needs a MinutesEditor");
  return value;
}
