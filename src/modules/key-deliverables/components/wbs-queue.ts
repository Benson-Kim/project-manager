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
}

export type Enqueue = <T extends WbsData>(change: QueuedChange<T>) => void;
