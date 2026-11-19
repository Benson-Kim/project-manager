"use client";

import { BaseEdge, Position, type EdgeProps } from "@xyflow/react";
import { useContext } from "react";
import { labelPoint, orthogonalPoints, pathOf, type Side } from "@/lib/connector-route";
import type { LinkEdge } from "../../canvas/board-model";
import { LinkLayoutContext } from "./use-link-layout";

const STANDOFF = 12;

const sideOf: Record<Position, Side> = {
  [Position.Left]: "left",
  [Position.Top]: "top",
  [Position.Right]: "right",
  [Position.Bottom]: "bottom",
};

/**
 * A trace link drawn with level and upright runs only, through the shared connector router. A
 * link someone styled or branched follows the line laid out for it from the cards' boxes.
 */
export function RoutedEdge(props: EdgeProps) {
  const laid = useContext(LinkLayoutContext).get(props.id);
  const style = (props.data as LinkEdge["data"])?.style;
  const dot = `dot-${props.id.replace(/[^\w-]/g, "_")}`;
  const dots = style?.startEnd === "dot" || style?.endEnd === "dot";
  const points =
    laid?.points ??
    orthogonalPoints(
      { x: props.sourceX, y: props.sourceY },
      sideOf[props.sourcePosition],
      { x: props.targetX, y: props.targetY },
      sideOf[props.targetPosition],
      STANDOFF,
    );
  const label = laid?.label ?? labelPoint(points);
  return (
    <>
      {dots ? (
        <defs>
          <marker id={dot} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8">
            <circle
              cx="5"
              cy="5"
              r="4"
              style={{ fill: style?.colour ?? "var(--xy-edge-stroke)" }}
            />
          </marker>
        </defs>
      ) : null}
      <BaseEdge
        id={props.id}
        path={laid?.path ?? pathOf(points)}
        markerStart={style?.startEnd === "dot" ? `url(#${dot})` : props.markerStart}
        markerEnd={style?.endEnd === "dot" ? `url(#${dot})` : props.markerEnd}
        style={props.style}
        interactionWidth={props.interactionWidth}
        label={props.label}
        labelX={label.x}
        labelY={label.y}
        labelStyle={props.labelStyle}
        labelShowBg={props.labelShowBg}
        labelBgStyle={props.labelBgStyle}
        labelBgPadding={props.labelBgPadding}
        labelBgBorderRadius={props.labelBgBorderRadius}
      />
    </>
  );
}
