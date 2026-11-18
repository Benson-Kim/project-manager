"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { orthogonalPoints, pathOf, type Side } from "@/lib/connector-route";
import type { Wbs } from "../schemas/wbs";
import { isSatisfied, type DependencyType, type WbsLink } from "../schemas/wbs-dependencies";

/**
 * The dependency arrows over the Gantt (ADR-0046). One SVG layer inside the chart's scroll
 * container, drawn from the predecessor's edge to the successor's, per type.
 *
 * The chart's rows interleave requirement rows and an add row, so a link's vertical position
 * cannot be derived from the breakdown: the layer measures the bars themselves through the
 * data-gantt-bar attribute each one already carries, in content coordinates, so the arrows do not
 * shift as the chart is scrolled.
 *
 * aria-hidden: an arrow is not reachable by keyboard and says nothing a screen reader can follow.
 * The Dependencies panel on the item menu is the accessible path to the same links (WCAG 2.5.7,
 * the treatment ADR-0027 section 8 gave drag-and-drop).
 */

interface Segment {
  id: number;
  predecessorId: number;
  successorId: number;
  d: string;
  head: string;
  satisfied: boolean;
}

/** The bar side a link leaves its predecessor through and meets its successor at, by type. */
const EDGES: Record<DependencyType, { from: Side; to: Side }> = {
  FS: { from: "right", to: "left" },
  SS: { from: "left", to: "left" },
  FF: { from: "right", to: "right" },
  SF: { from: "left", to: "right" },
};

/** How far an elbow stands off a bar before it turns, in pixels. */
const STANDOFF = 10;
const HEAD = 4;

export interface GanttBar {
  left: number;
  right: number;
  middle: number;
}

/** The line and arrow head for one link between two measured bars. */
export function dependencyLine(type: DependencyType, from: GanttBar, to: GanttBar) {
  const edges = EDGES[type];
  const start = { x: edges.from === "right" ? from.right : from.left, y: from.middle };
  const end = { x: edges.to === "right" ? to.right : to.left, y: to.middle };
  const d = pathOf(orthogonalPoints(start, edges.from, end, edges.to, STANDOFF));
  // The head points the way the arrow arrives: into a left edge from the left, into a right edge
  // from the right.
  const dir = edges.to === "right" ? 1 : -1;
  const head = `M ${end.x} ${end.y} l ${dir * HEAD} ${-HEAD} M ${end.x} ${end.y} l ${dir * HEAD} ${HEAD}`;
  return { d, head };
}

export function WbsDependencyArrows({
  scrollRef,
  links,
  wbs,
  geometryKey,
  anchorOf,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  links: readonly WbsLink[];
  wbs: Wbs;
  /** Changes whenever anything that moves a bar changes, so the layer re-measures. */
  geometryKey: string;
  /** For an item with no bar on screen, the item whose bar stands for it (null: none). */
  anchorOf?: (id: number) => number | null;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [resized, setResized] = useState(0);

  // On mount the chart's scroll box gets its ref only after this layer's layout effect has run,
  // so the first measure finds no container; the observer's first callback measures again.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setResized((n) => n + 1));
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollRef]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || links.length === 0) {
      setSegments([]);
      return;
    }
    const box = container.getBoundingClientRect();
    const originX = box.left - container.scrollLeft;
    const originY = box.top - container.scrollTop;
    const elementOf = (id: number) => {
      const el = container.querySelector(`[data-gantt-bar="${id}"]`);
      if (el || !anchorOf) return el;
      const anchor = anchorOf(id);
      return anchor === null ? null : container.querySelector(`[data-gantt-bar="${anchor}"]`);
    };
    const barOf = (el: Element | null): GanttBar | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left - originX,
        right: r.right - originX,
        middle: r.top - originY + r.height / 2,
      };
    };

    const next: Segment[] = [];
    for (const link of links) {
      const fromEl = elementOf(link.predecessorId);
      const toEl = elementOf(link.successorId);
      // Two items drawn in one card have nothing to join on screen.
      if (fromEl && fromEl === toEl) continue;
      const from = barOf(fromEl);
      const to = barOf(toEl);
      if (!from || !to) continue;
      const { d, head } = dependencyLine(link.type, from, to);
      next.push({
        id: link.id,
        predecessorId: link.predecessorId,
        successorId: link.successorId,
        d,
        head,
        satisfied: isSatisfied(link, wbs),
      });
    }
    setSegments(next);
    setSize({ width: container.scrollWidth, height: container.scrollHeight });
  }, [scrollRef, links, wbs, geometryKey, anchorOf, resized]);

  if (segments.length === 0 || !size) return null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10 overflow-visible"
      width={size.width}
      height={size.height}
    >
      {segments.map((segment) => (
        <g
          key={segment.id}
          data-gantt-dependency-from={segment.predecessorId}
          data-gantt-dependency-to={segment.successorId}
          className={segment.satisfied ? "stroke-ink-muted" : "stroke-danger"}
          fill="none"
          strokeWidth={1.5}
        >
          <path d={segment.d} strokeDasharray={segment.satisfied ? undefined : "3 2"} />
          <path d={segment.head} />
        </g>
      ))}
    </svg>
  );
}
