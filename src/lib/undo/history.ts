import type { ActionResult } from "@/lib/action";

/** How many changes a page can take back, and make again, newest first. */
export const HISTORY_LIMIT = 30;

/**
 * done: the server took it. stale: the record changed under us, is gone or can no longer be edited,
 * so every step on it goes. failed: offline or a server fault, so the step stays to try again.
 */
export type StepOutcome = "done" | "stale" | "failed";

/** One change a page can take back: what it is called, which records it touches, both ways. */
export interface UndoStep {
  readonly label: string;
  /** The records it writes, e.g. "todo-items:42"; a stale outcome forgets every step on them. */
  targets(): readonly string[];
  undo(): Promise<StepOutcome>;
  redo(): Promise<StepOutcome>;
}

export type Direction = "undo" | "redo";

export interface History {
  readonly past: readonly UndoStep[];
  readonly future: readonly UndoStep[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

const capped = (steps: readonly UndoStep[]) => steps.slice(-HISTORY_LIMIT);

/** A new change: it goes on top, and what Redo had is gone. */
export function recordStep(history: History, step: UndoStep): History {
  return { past: capped([...history.past, step]), future: [] };
}

export function nextStep(history: History, direction: Direction): UndoStep | null {
  return (direction === "undo" ? history.past : history.future).at(-1) ?? null;
}

/** Drops every step that writes one of `targets`, both ways. */
export function forgetTargets(history: History, targets: readonly string[]): History {
  const untouched = (step: UndoStep) => !step.targets().some((t) => targets.includes(t));
  return { past: history.past.filter(untouched), future: history.future.filter(untouched) };
}

/** Where a step goes once the server answered: across, gone with its record, or left to retry. */
export function settleStep(
  history: History,
  direction: Direction,
  step: UndoStep,
  outcome: StepOutcome,
  staleTargets: readonly string[] = step.targets(),
): History {
  if (outcome === "failed") return history;
  if (outcome === "stale") return forgetTargets(history, staleTargets);
  const without = (steps: readonly UndoStep[]) => steps.filter((s) => s !== step);
  return direction === "undo"
    ? { past: without(history.past), future: capped([...without(history.future), step]) }
    : { past: capped([...without(history.past), step]), future: without(history.future) };
}

const STALE_CODES: ReadonlySet<string> = new Set([
  "NOT_FOUND",
  "CONFLICT",
  "FORBIDDEN_ROW",
  "FORBIDDEN",
  "VALIDATION",
  "DUPLICATE",
  "LIMIT_REACHED",
  "QUOTA_EXCEEDED",
]);

/** A refusal that trying again cannot change is stale; anything else is worth another try. */
export function outcomeOf(result: ActionResult<unknown>): StepOutcome {
  if (result.ok) return "done";
  return STALE_CODES.has(result.error.code) ? "stale" : "failed";
}
