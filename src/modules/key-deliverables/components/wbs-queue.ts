import type { ActionResult } from "@/lib/action";
import type { WbsData } from "../schemas/key-deliverable";
import type { WbsItem } from "../schemas/wbs";

/** One change for the editor's save queue: shown at once, saved in order behind the others. */
export interface QueuedChange<T extends WbsData> {
  kind?: "add" | "change";
  /** Shows the change before the server confirms it. */
  apply?: (items: WbsItem[]) => WbsItem[];
  /** Null when the change no longer applies (its item is gone). */
  send: (current: WbsItem[]) => Promise<ActionResult<T>> | null;
  done?: (data: T, items: WbsItem[]) => void;
  /** The server refused it, or it no longer applied. */
  failed?: () => void;
}

export type Enqueue = <T extends WbsData>(change: QueuedChange<T>) => void;

/** What a refused save says: the first field's reason, else the error's own message. */
export function firstError(error: {
  message: string;
  fieldErrors?: Record<string, string[]>;
}): string {
  return (error.fieldErrors && Object.values(error.fieldErrors).flat()[0]) || error.message;
}
