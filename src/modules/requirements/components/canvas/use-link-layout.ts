"use client";

import { useStore, type ReactFlowState } from "@xyflow/react";
import { createContext, useCallback, useMemo } from "react";
import type { Rect } from "@/lib/connector-route";
import type { LinkEdge } from "../../canvas/board-model";
import { NODE_HEIGHT, NODE_WIDTH } from "../../canvas/layout";
import { layoutLinks, type EdgeGeometry, type LaidEdge } from "../../canvas/link-layout";

export const LinkLayoutContext = createContext<ReadonlyMap<string, EdgeGeometry>>(new Map());

const NO_EDGES: LaidEdge[] = [];

const laidOf = (edge: LinkEdge): LaidEdge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  style: edge.data?.style ?? null,
  branch: edge.data?.branch ?? null,
});

const sameBoxes = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** The drawn lines of the styled and branched edges, laid out again whenever a card moves or resizes. */
export function useLinkLayout(edges: readonly LinkEdge[]): ReadonlyMap<string, EdgeGeometry> {
  const laid = useMemo(() => {
    const shown = edges.filter((edge) => !edge.hidden);
    return shown.some((edge) => edge.data?.style || edge.data?.branch)
      ? shown.map(laidOf)
      : NO_EDGES;
  }, [edges]);
  const ids = useMemo(
    () => [...new Set(laid.flatMap((edge) => [edge.source, edge.target]))],
    [laid],
  );
  const boxes = useStore(
    useCallback(
      (state: ReactFlowState) =>
        ids.flatMap((id) => {
          const node = state.nodeLookup.get(id);
          if (!node) return [0, 0, 0, 0];
          const { x, y } = node.internals.positionAbsolute;
          return [x, y, node.measured.width ?? NODE_WIDTH, node.measured.height ?? NODE_HEIGHT];
        }),
      [ids],
    ),
    sameBoxes,
  );
  return useMemo(() => {
    if (laid === NO_EDGES) return new Map<string, EdgeGeometry>();
    const rects = new Map<string, Rect>();
    ids.forEach((id, index) => {
      const [x, y, width, height] = boxes.slice(index * 4, index * 4 + 4);
      if (width > 0) rects.set(id, { x, y, width, height });
    });
    return layoutLinks(laid, rects);
  }, [laid, ids, boxes]);
}
