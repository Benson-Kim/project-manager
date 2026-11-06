"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { createContext, memo, useContext } from "react";
import { messages } from "@/lib/messages";
import type { ItemNode } from "../../canvas/board-model";
import { itemKey, type CanvasGaps } from "../../canvas/gaps";
import type { CanvasItem } from "../../schemas/canvas";
import { GapChips, ItemBadge } from "./item-chips";

const M = messages.requirements.canvas;

export const BoardContext = createContext<{
  canEdit: boolean;
  gaps: ReadonlyMap<string, CanvasGaps>;
  dimmed: ReadonlySet<string>;
  collapsible: ReadonlySet<string>;
  hiddenCount: ReadonlyMap<string, number>;
  onHide: (item: CanvasItem) => void;
  onToggleCollapse: (item: CanvasItem) => void;
} | null>(null);

/** One item on the board. Upstream enters on the left, downstream leaves on the right. */
export const ItemNodeView = memo(function ItemNodeView({ data, selected }: NodeProps<ItemNode>) {
  const board = useContext(BoardContext);
  const { item } = data;
  const key = itemKey(item.Kind, item.ItemId);
  const dimmed = board?.dimmed.has(key) ?? false;

  return (
    <div
      data-testid={`canvas-node-${item.Kind}-${item.ItemId}`}
      data-dimmed={dimmed || undefined}
      className={`flex h-full w-full flex-col gap-1 overflow-hidden rounded-md bg-surface-raised p-2 text-left shadow-sm ${
        selected ? "ring-2 ring-accent" : ""
      } ${dimmed ? "opacity-40" : ""}`}
    >
      <Handle id="upstream" type="target" position={Position.Left} />
      <div className="flex items-center gap-1">
        {board?.canEdit && (item.IsCollapsed || board.collapsible.has(key)) ? (
          <button
            type="button"
            data-testid="canvas-node-collapse"
            aria-expanded={!item.IsCollapsed}
            aria-label={item.IsCollapsed ? M.expand(item.Ref) : M.collapse(item.Ref)}
            onClick={() => board.onToggleCollapse(item)}
            className="nodrag min-h-6 min-w-6 rounded text-ink-muted"
          >
            {item.IsCollapsed ? "▸" : "▾"}
          </button>
        ) : null}
        <ItemBadge type={item.Type} refLabel={item.Ref} />
        <span className="min-w-0 flex-1" />
        {board?.canEdit ? (
          <button
            type="button"
            aria-label={M.hide(item.Ref)}
            onClick={() => board.onHide(item)}
            className="nodrag min-h-6 min-w-6 rounded text-ink-muted"
          >
            ×
          </button>
        ) : null}
      </div>
      <p className="line-clamp-2 text-sm font-medium text-ink">{item.Title}</p>
      {item.Summary ? <p className="line-clamp-2 text-xs text-ink-muted">{item.Summary}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-1">
        <GapChips gap={board?.gaps.get(key)} />
        {board?.hiddenCount.get(key) ? (
          <span data-testid="canvas-hidden-count" className="text-[10px] text-ink-muted">
            {M.hiddenCount(board.hiddenCount.get(key) ?? 0)}
          </span>
        ) : null}
        {item.Status ? <span className="text-[10px] text-ink-muted">{item.Status}</span> : null}
      </div>
      <Handle id="downstream" type="source" position={Position.Right} />
    </div>
  );
});
