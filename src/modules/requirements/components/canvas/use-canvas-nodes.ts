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
  settlePlacements,
  type Placement,
  type Placements,
} from "../../canvas/board-model";
import { itemKey } from "../../canvas/gaps";
import type { Point } from "../../canvas/layout";
import { nodesBack } from "../../canvas/undo";
import type { CanvasItem } from "../../schemas/canvas";
import type { Remember } from "./use-canvas-undo";

type Moved = { id: string } & Point;
interface NodeMove {
  kind: CanvasItem["Kind"];
  itemId: number;
  x: number | null;
  y: number | null;
  isCollapsed: boolean;
}

const nodeMove = (item: CanvasItem, to: Placement): NodeMove => ({
  kind: item.Kind,
  itemId: item.ItemId,
  x: to.X,
  y: to.Y,
  isCollapsed: to.IsCollapsed,
});

/**
 * Placements show at once and save behind. A refused write puts back what it replaced, unless a
 * later write has already taken that node. Remount per canvas, so nothing carries across. Every
 * write is remembered for Undo, except the ones Undo itself makes.
 */
export function useCanvasNodes(canvasId: number, items: readonly CanvasItem[], remember: Remember) {
  const { toast } = useToast();
  const [overlay, setOverlay] = useState<ReadonlyMap<string, Placement>>(new Map());
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    setOverlay((current) => settlePlacements(current, seen, items));
  }
  const shown = useMemo(() => applyPlacements(items, overlay), [items, overlay]);

  const write = async (
    changes: ReadonlyMap<string, Placement>,
    save: () => Promise<ActionResult<unknown>>,
    undoable: boolean,
  ) => {
    const before = overlay;
    const forget = undoable ? remember(nodesBack(shown, changes)) : undefined;
    setOverlay((current) => new Map([...current, ...changes]));
    const result = await save();
    if (result.ok) return true;
    forget?.();
    toast({ variant: "error", title: firstError(result.error) });
    setOverlay((current) => rollbackPlacements(current, changes, before));
    return false;
  };

  const reveal = (item: CanvasItem, point?: Point, undoable = true) =>
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
      undoable,
    );

  const hide = (item: CanvasItem, undoable = true) =>
    write(
      new Map([
        [
          itemKey(item.Kind, item.ItemId),
          { OnCanvas: false, X: null, Y: null, IsCollapsed: false },
        ],
      ]),
      () => removeCanvasNodeAction({ canvasId, kind: item.Kind, itemId: item.ItemId }),
      undoable,
    );

  const place = (nodes: readonly NodeMove[], undoable = true) => {
    if (nodes.length === 0) return;
    const changes = new Map(
      nodes.map((node): [string, Placement] => [
        itemKey(node.kind, node.itemId),
        { OnCanvas: true, X: node.x, Y: node.y, IsCollapsed: node.isCollapsed },
      ]),
    );
    return write(changes, () => moveCanvasNodesAction({ canvasId, nodes: [...nodes] }), undoable);
  };

  const move = (moves: readonly Moved[]) => place(savedMoves(moves, shown));

  /** Null positions hand every node back to the layout, which runs on each load. */
  const autoLayout = () =>
    place(
      shown
        .filter((item) => item.OnCanvas)
        .map((item) => nodeMove(item, { ...item, X: null, Y: null })),
    );

  const toggleCollapse = (item: CanvasItem) =>
    place([nodeMove(item, { ...item, IsCollapsed: !item.IsCollapsed })]);

  /** Puts nodes back as they were before a change. A removed node comes back, then folds again. */
  const restore = (before: Placements) => {
    const back: NodeMove[] = [];
    for (const item of shown) {
      const was = before.get(itemKey(item.Kind, item.ItemId));
      if (!was) continue;
      if (!was.OnCanvas) {
        if (item.OnCanvas) void hide(item, false);
      } else if (!item.OnCanvas) {
        const point = was.X !== null && was.Y !== null ? { x: was.X, y: was.Y } : undefined;
        void reveal(item, point, false).then((ok) => {
          if (ok && was.IsCollapsed) void place([nodeMove(item, was)], false);
        });
      } else back.push(nodeMove(item, was));
    }
    void place(back, false);
  };

  return { shown, reveal, hide, move, autoLayout, toggleCollapse, restore };
}
