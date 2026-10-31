"use client";

import type { RefObject } from "react";
import { useFlip as useElementFlip } from "@/components/ui/motion/use-flip";
import type { Wbs } from "../schemas/wbs";

export { flipDeltas, type Spot } from "@/components/ui/motion/use-flip";

const FLIP_MS = 200;

/**
 * What decides where the boxes sit: which show, in what order, under which
 * parent. A save that changes only a name or a date keeps it, so the server's
 * answer to a move never animates the move a second time.
 */
export function flipKey(wbs: Wbs, collapsed: ReadonlySet<number>): string {
  const placed = wbs.order.map((id) => `${id}:${wbs.nodes.get(id)?.parentId ?? ""}`).join(",");
  const folded = [...collapsed].filter((id) => wbs.nodes.has(id)).sort((a, b) => a - b);
  return `${placed}|${folded.join(",")}`;
}

/** The WBS boxes glide when the breakdown's shape changes; zoom scales the measured offsets. */
export function useFlip(containerRef: RefObject<HTMLElement | null>, key: string, zoom: number) {
  useElementFlip(containerRef, key, { attribute: "data-wbs-box", duration: FLIP_MS, zoom });
}
