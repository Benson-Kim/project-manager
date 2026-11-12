"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { messages } from "@/lib/messages";
import { DIAGRAM_LIMITS, type BpmnFlow, type FlowKind } from "../model/diagram";
import { defaultSlash, FLOW_DASH } from "../model/svg";
import { InlineText, useBoard } from "./board-context";

const M = messages.bpmn;

export type FlowEdgeData = { flow: BpmnFlow };
export type FlowFlowEdge = Edge<FlowEdgeData, "flow">;

const END_MARKER: Record<FlowKind, string | null> = {
  sequence: "arrow",
  default: "arrow",
  message: "open-arrow",
  association: null,
};

const markerUrl = (name: string, selected: boolean) =>
  `url(#bpmn-${name}${selected ? "-selected" : ""})`;

/** The arrowheads every connector refers to, in the ink and the selection colours. */
export function FlowMarkers() {
  const variants = [
    { suffix: "", colour: "var(--ink)" },
    { suffix: "-selected", colour: "var(--accent)" },
  ];
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        {variants.map(({ suffix, colour }) => (
          <g key={suffix}>
            <marker
              id={`bpmn-arrow${suffix}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 Z" style={{ fill: colour }} />
            </marker>
            <marker
              id={`bpmn-open-arrow${suffix}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              orient="auto-start-reverse"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 Z"
                style={{ fill: "var(--surface)", stroke: colour, strokeWidth: 1 }}
              />
            </marker>
            <marker
              id={`bpmn-circle${suffix}`}
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="8"
              markerHeight="8"
            >
              <circle
                cx="5"
                cy="5"
                r="4"
                style={{ fill: "var(--surface)", stroke: colour, strokeWidth: 1 }}
              />
            </marker>
          </g>
        ))}
      </defs>
    </svg>
  );
}

/** A sequence, message, default flow or association, with the text written on it. */
export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected = false,
}: EdgeProps<FlowFlowEdge>) {
  const board = useBoard();
  if (!data) return null;
  const { flow } = data;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 6,
  });
  const stroke = selected ? "var(--accent)" : "var(--ink)";
  const end = END_MARKER[flow.kind];
  const editing = board.editingId === flow.id;
  const labelStyle = {
    transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={18}
        markerEnd={end ? markerUrl(end, selected) : undefined}
        markerStart={flow.kind === "message" ? markerUrl("circle", selected) : undefined}
        style={{ stroke, strokeWidth: selected ? 2 : 1.5, strokeDasharray: FLOW_DASH[flow.kind] }}
      />
      {flow.kind === "default" ? (
        <path
          d={defaultSlash({ x: sourceX, y: sourceY }, flow.sourceSide)}
          style={{ stroke, strokeWidth: 1.5 }}
        />
      ) : null}
      <EdgeLabelRenderer>
        {editing ? (
          <div
            className="nodrag nopan absolute z-10 w-48"
            style={{ ...labelStyle, pointerEvents: "all" }}
          >
            <InlineText
              value={flow.label}
              label={M.flowText}
              maxLength={DIAGRAM_LIMITS.label}
              className="w-full"
              onCommit={(text) => {
                board.setFlowLabel(flow.id, text);
                board.stopEdit();
              }}
              onCancel={board.stopEdit}
            />
          </div>
        ) : flow.label ? (
          <div
            data-testid="bpmn-flow-label"
            className={`nodrag nopan absolute max-w-48 rounded bg-surface/90 px-1 text-center text-xs leading-tight whitespace-pre-wrap break-words ${
              selected ? "text-accent" : "text-ink"
            }`}
            style={{ ...labelStyle, pointerEvents: "all" }}
            onDoubleClick={() => {
              if (board.canEdit) board.startEdit(flow.id);
            }}
          >
            {flow.label}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}
