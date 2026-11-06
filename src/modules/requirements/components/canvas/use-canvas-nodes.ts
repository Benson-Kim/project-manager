"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { firstError } from "@/modules/key-deliverables/components/wbs-queue";
import { addCanvasNodeAction, moveCanvasNodesAction, removeCanvasNodeAction } from "../../actions";
import {
  applyPlacements,
  rollbackPlacements,
  savedMoves,
  type Placement,
} from "../../canvas/board-model";
import { itemKey } from "../../canvas/gaps";
import type { Point } from "../../canvas/layout";
import type { CanvasItem } from "../../schemas/canvas";

type Moved = { id: string } & Point;
interface NodeMove {
  kind: CanvasItem["Kind"];
  itemId: number;
  x: number | null;
  y: number | null;
  isCollapsed: boolean;
}

/**
 * Placements show at once and save behind. A refused write puts back what it replaced, unless a
 * later write has already taken that node. Remount per canvas, so nothing carries across.
 */
export function useCanvasNodes(canvasId: number, items: readonly CanvasItem[]) {
  const { toast } = useToast();
  const [overlay, setOverlay] = useState<ReadonlyMap<string, Placement>>(new Map());
  const shown = useMemo(() => applyPlacements(items, overlay), [items, overlay]);

  const write = async (
    changes: ReadonlyMap<string, Placement>,
    save: () => Promise<ActionResult<unknown>>,
  ) => {
    const before = overlay;
    setOverlay((current) => new Map([...current, ...changes]));
    const result = await save();
    if (result.ok) return;
    toast({ variant: "error", title: firstError(result.error) });
    setOverlay((current) => rollbackPlacements(current, changes, before));
  };

  const reveal = (item: CanvasItem, point?: Point) =>
    write(
      new Map([
        [
          itemKey(item.Kind, item.ItemId),
          { OnCanvas: true, X: point?.x ?? null, Y: point?.y ?? null, IsCollapsed: false },
        ],
      ]),
      () =>
        addCanvasNodeAction({
          canvasId,
          kind: item.Kind,
          itemId: item.ItemId,
          x: point?.x ?? null,
          y: point?.y ?? null,
        }),
    );

  const hide = (item: CanvasItem) =>
    write(
      new Map([
        [
          itemKey(item.Kind, item.ItemId),
          { OnCanvas: false, X: null, Y: null, IsCollapsed: false },
        ],
      ]),
      () => removeCanvasNodeAction({ canvasId, kind: item.Kind, itemId: item.ItemId }),
    );

  const place = (nodes: readonly NodeMove[]) => {
    if (nodes.length === 0) return;
    const changes = new Map(
      nodes.map((node): [string, Placement] => [
        itemKey(node.kind, node.itemId),
        { OnCanvas: true, X: node.x, Y: node.y, IsCollapsed: node.isCollapsed },
      ]),
    );
    return write(changes, () => moveCanvasNodesAction({ canvasId, nodes: [...nodes] }));
  };

  const move = (moves: readonly Moved[]) => place(savedMoves(moves, shown));

  /** Null positions hand every node back to the layout, which runs on each load. */
  const autoLayout = () =>
    place(
      shown
        .filter((item) => item.OnCanvas)
        .map((item) => ({
          kind: item.Kind,
          itemId: item.ItemId,
          x: null,
          y: null,
          isCollapsed: item.IsCollapsed,
        })),
    );

  const toggleCollapse = (item: CanvasItem) =>
    place([
      {
        kind: item.Kind,
        itemId: item.ItemId,
        x: item.X,
        y: item.Y,
        isCollapsed: !item.IsCollapsed,
      },
    ]);

  return { shown, reveal, hide, move, autoLayout, toggleCollapse };
}
