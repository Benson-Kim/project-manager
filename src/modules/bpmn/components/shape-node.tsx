"use client";

import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { messages } from "@/lib/messages";
import { DIAGRAM_LIMITS, SIDES, type BpmnShape, type Side } from "../model/diagram";
import { isResizable, SHAPE_SPECS } from "../model/shapes";
import { InlineText, useBoard } from "./board-context";
import { Glyph } from "./glyph";

const M = messages.bpmn;

export type ShapeNodeData = { shape: BpmnShape };
export type ShapeFlowNode = Node<ShapeNodeData, "shape">;

const POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const LABEL_CLASS = {
  inside: "absolute inset-0 flex items-center justify-center overflow-hidden px-2 py-1 text-center",
  annotation: "absolute inset-0 overflow-hidden py-1 pl-3 pr-1 text-left",
  below: "absolute left-1/2 top-full mt-1 w-36 -translate-x-1/2 text-center",
} as const;

/** One BPMN symbol on the canvas: its glyph, its text, and a dot on each side to connect from. */
export function ShapeNode({ data, selected }: NodeProps<ShapeFlowNode>) {
  const board = useBoard();
  const { shape } = data;
  const spec = SHAPE_SPECS[shape.kind];
  const editing = board.editingId === shape.id;
  const name = M.shapes[shape.kind];

  return (
    <div
      data-testid="bpmn-shape"
      data-kind={shape.kind}
      data-label={shape.label}
      aria-label={shape.label ? `${name}: ${shape.label}` : name}
      className={`group relative rounded-sm ${selected ? "outline-2 outline-offset-4 outline-accent outline-dashed" : ""}`}
      style={{ width: shape.width, height: shape.height }}
      onDoubleClick={() => {
        if (board.canEdit) board.startEdit(shape.id);
      }}
    >
      {board.canEdit && isResizable(shape.kind) ? (
        <NodeResizer
          isVisible={selected && !editing}
          minWidth={60}
          minHeight={40}
          onResizeStart={board.beginGesture}
          onResizeEnd={board.endGesture}
        />
      ) : null}
      <Glyph kind={shape.kind} width={shape.width} height={shape.height} />
      {editing ? (
        <div
          className={
            spec.labelPlace === "below"
              ? "absolute left-1/2 top-full z-10 mt-1 w-40 -translate-x-1/2"
              : "absolute inset-1 z-10"
          }
        >
          <InlineText
            value={shape.label}
            label={M.shapeText}
            multiline
            maxLength={DIAGRAM_LIMITS.label}
            className="h-full min-h-12 w-full resize-none"
            onCommit={(text) => {
              board.setShapeLabel(shape.id, text);
              board.stopEdit();
            }}
            onCancel={board.stopEdit}
          />
        </div>
      ) : shape.label ? (
        <div
          className={`${LABEL_CLASS[spec.labelPlace]} pointer-events-none text-xs leading-tight whitespace-pre-wrap break-words text-ink`}
        >
          {shape.label}
        </div>
      ) : null}
      {SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={POSITION[side]}
          isConnectable={board.canEdit}
          className={`!h-2.5 !w-2.5 !border-accent !bg-surface transition-opacity ${
            board.canEdit
              ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              : "!opacity-0"
          } ${selected && board.canEdit ? "!opacity-100" : ""}`}
        />
      ))}
    </div>
  );
}
