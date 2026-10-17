"use client";

import { createContext, useContext } from "react";
import type { ActionResult } from "@/lib/action";
import type {
  MeetingWorkspace,
  WorkspaceActionItem,
  WorkspaceDiscussionPoint,
} from "../schemas/meeting";
import type { Sibling } from "../schemas/minutes";
import type { StakeholderOption } from "@/modules/stakeholders/repository/stakeholder-options";

export type MinutesAnswer = ActionResult<MeetingWorkspace | null>;

/** A reorder the editor sends: the siblings' new order, under their parent. */
export type MoveRequest =
  | { kind: "agenda" }
  | { kind: "point"; agendaItemId: number }
  | { kind: "action"; agendaItemId: number; discussionPointId: number | null };

export interface DeleteTarget {
  kind: "agenda" | "point" | "action";
  id: number;
  rowVer: number;
  name: string;
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
  people: (action?: WorkspaceActionItem) => StakeholderOption[];
  /** "YYYY-MM-DD" on the server's calendar: actions due before it are overdue. */
  today: string;
}

export const MinutesContext = createContext<MinutesContextValue | null>(null);

export function useMinutes(): MinutesContextValue {
  const value = useContext(MinutesContext);
  if (!value) throw new Error("useMinutes needs a MinutesEditor");
  return value;
}
