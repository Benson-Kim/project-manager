"use client";

import {
  NodeResizeControl,
  ResizeControlVariant,
  useStore,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { messages } from "@/lib/messages";
import { DIAGRAM_LIMITS, poolHeight, type BpmnLane, type BpmnPool } from "../model/diagram";
import { LANE_HEADER, laneRects, POOL_HEADER } from "../model/edit";
import { InlineText, useBoard } from "./board-context";
import { POOL_DRAG_HANDLE } from "./board-model";

const M = messages.bpmn;

export type PoolNodeData = { pool: BpmnPool };
export type PoolFlowNode = Node<PoolNodeData, "pool">;

const HEADER = `${POOL_DRAG_HANDLE} absolute top-0 flex h-full cursor-move items-center justify-center overflow-hidden border-r border-ink-muted bg-surface-raised`;
const VERTICAL = "rotate-180 truncate text-xs font-semibold [writing-mode:vertical-rl]";
const LANE_STEP = 10;

/**
 * A pool and its lanes. Only the heading strips take the pointer, so a click in a lane reaches
 * the connectors and the canvas under it; dragging a heading moves the pool with what is in it.
 */
export function PoolNode({ data, selected }: NodeProps<PoolFlowNode>) {
  const board = useBoard();
  const zoom = useStore((state) => state.transform[2]);
  const { pool } = data;
  const height = poolHeight(pool);
  const showLanes = pool.lanes.length > 1;
  const editingPool = board.editingId === pool.id;

  const resizeLaneBy = (lane: BpmnLane, delta: number) => {
    board.beginGesture();
    board.resizeLane(pool.id, lane.id, lane.height + delta);
    board.endGesture();
  };

  const startLaneDrag = (lane: BpmnLane) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    board.beginGesture();
    const move = (moved: PointerEvent) =>
      board.resizeLane(pool.id, lane.id, lane.height + (moved.clientY - startY) / zoom);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      board.endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const laneTops = laneRects(pool).map((rect) => rect.y - pool.y);
  return (
    <div
      data-testid="bpmn-pool"
      data-name={pool.name}
      className="relative"
      style={{ width: pool.width, height, pointerEvents: "none" }}
    >
      <div
        className={`absolute inset-0 border-2 ${selected ? "border-accent" : "border-ink-muted"}`}
      />
      <div
        data-testid="bpmn-pool-header"
        title={pool.name}
        className={`${HEADER} left-0`}
        style={{ width: POOL_HEADER, pointerEvents: "auto" }}
        onDoubleClick={() => {
          if (board.canEdit) board.startEdit(pool.id);
        }}
      >
        <span className={`${VERTICAL} text-ink`}>{pool.name}</span>
      </div>
      {editingPool ? (
        <div
          className="absolute z-10 w-56"
          style={{ left: POOL_HEADER + 4, top: 4, pointerEvents: "auto" }}
        >
          <InlineText
            value={pool.name}
            label={M.poolName}
            maxLength={DIAGRAM_LIMITS.name}
            className="w-full"
            onCommit={(name) => {
              board.renamePool(pool.id, name);
              board.stopEdit();
            }}
            onCancel={board.stopEdit}
          />
        </div>
      ) : null}
      {pool.lanes.map((lane, index) => {
        const laneTop = laneTops[index]!;
        const editingLane = board.editingId === lane.id;
        return (
          <div
            key={lane.id}
            data-testid="bpmn-lane"
            data-name={lane.name}
            className={`absolute ${index < pool.lanes.length - 1 ? "border-b border-ink-muted" : ""}`}
            style={{
              left: POOL_HEADER,
              top: laneTop,
              width: pool.width - POOL_HEADER,
              height: lane.height,
            }}
          >
            {showLanes ? (
              <div
                data-testid="bpmn-lane-header"
                title={lane.name}
                className={`${HEADER} group left-0`}
                style={{ width: LANE_HEADER, pointerEvents: "auto" }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (board.canEdit) board.startEdit(lane.id);
                }}
              >
                <span className={`${VERTICAL} text-ink-muted`}>{lane.name}</span>
                {board.canEdit && selected ? (
                  <button
                    type="button"
                    data-testid="bpmn-remove-lane"
                    aria-label={M.removeLane(lane.name)}
                    title={M.removeLane(lane.name)}
                    className="nodrag absolute top-1 left-1/2 -translate-x-1/2 rounded px-1 text-xs leading-none text-ink-muted hover:bg-surface hover:text-danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      board.removeLane(pool.id, lane.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ) : null}
            {editingLane ? (
              <div
                className="absolute z-10 w-48"
                style={{ left: LANE_HEADER + 4, top: 4, pointerEvents: "auto" }}
              >
                <InlineText
                  value={lane.name}
                  label={M.laneNameLabel}
                  maxLength={DIAGRAM_LIMITS.name}
                  className="w-full"
                  onCommit={(name) => {
                    board.renameLane(pool.id, lane.id, name);
                    board.stopEdit();
                  }}
                  onCancel={board.stopEdit}
                />
              </div>
            ) : null}
            {board.canEdit ? (
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={M.resizeLane(lane.name)}
                aria-valuenow={lane.height}
                aria-valuemin={DIAGRAM_LIMITS.minLane}
                aria-valuemax={DIAGRAM_LIMITS.maxSize}
                tabIndex={0}
                data-testid="bpmn-lane-resize"
                className="nodrag absolute -bottom-1 left-0 h-2 w-full cursor-row-resize hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-none"
                style={{ pointerEvents: "auto" }}
                onPointerDown={startLaneDrag(lane)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    event.stopPropagation();
                    resizeLaneBy(lane, event.key === "ArrowUp" ? -LANE_STEP : LANE_STEP);
                  }
                }}
              />
            ) : null}
          </div>
        );
      })}
      {board.canEdit && selected && pool.lanes.length < DIAGRAM_LIMITS.lanesPerPool ? (
        <button
          type="button"
          data-testid="bpmn-add-lane"
          className="nodrag absolute left-0 rounded-b border border-t-0 border-ink-muted bg-surface px-2 py-0.5 text-xs text-ink hover:bg-surface-raised"
          style={{ top: height, pointerEvents: "auto" }}
          onClick={(event) => {
            event.stopPropagation();
            board.addLane(pool.id);
          }}
        >
          + {M.addLane}
        </button>
      ) : null}
      {board.canEdit ? (
        <NodeResizeControl
          position="right"
          variant={ResizeControlVariant.Line}
          minWidth={POOL_HEADER + LANE_HEADER + 60}
          minHeight={height}
          maxHeight={height}
          style={{ pointerEvents: "auto", borderWidth: 4, borderColor: "transparent" }}
          onResizeStart={board.beginGesture}
          onResizeEnd={board.endGesture}
        />
      ) : null}
    </div>
  );
}
