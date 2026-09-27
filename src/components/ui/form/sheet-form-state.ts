/**
 * Pure state-machine helpers for Sheet/form submit + delete cycles ).
 * DOM-free — testable in vitest node env. The "use client" hook in
 * use-sheet-form-actions.ts wires these to React state + context.
 */
import type { ActionResult, ActionErrorCode } from "@/lib/action";

export interface SheetFormStateConfig {
  onSuccess: () => void;
  setSummary: (msg: string | null) => void;
  setConflict: (v: boolean) => void;
  toast: (msg: string) => void;
  announce: (msg: string) => void;
  refresh: () => void;
  applyResult: (r: ActionResult<unknown>) => void;
}

/**
 * Handle a create/update ActionResult: on success calls toast + announce +
 * onSuccess + refresh; on failure applies field errors + sets summary +
 * optionally sets conflict flag.
 */
export function handleActionResult(
  result: ActionResult<unknown>,
  successMsg: string,
  cfg: SheetFormStateConfig,
): void {
  if (result.ok) {
    cfg.toast(successMsg);
    cfg.announce(successMsg);
    cfg.onSuccess();
    cfg.refresh();
  } else {
    cfg.applyResult(result);
    cfg.setSummary(result.error.message);
    if (result.error.code === "CONFLICT") cfg.setConflict(true);
  }
}

/**
 * Handle a delete ActionResult: always dismisses the confirm dialog first;
 * on success calls toast + announce + onSuccess + refresh; on failure sets
 * summary + optionally sets conflict flag.
 */
export function handleDeleteResult(
  result: ActionResult<unknown>,
  deletedMsg: string,
  setConfirmDelete: (v: boolean) => void,
  cfg: SheetFormStateConfig,
): void {
  setConfirmDelete(false);
  if (result.ok) {
    cfg.toast(deletedMsg);
    cfg.announce(deletedMsg);
    cfg.onSuccess();
    cfg.refresh();
  } else {
    cfg.setSummary(result.error.message);
    if (result.error.code === "CONFLICT") cfg.setConflict(true);
  }
}
