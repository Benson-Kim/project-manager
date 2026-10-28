"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
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

/** Where a link leaves its predecessor and meets its successor, by type. */
const EDGES: Record<DependencyType, { from: "start" | "end"; to: "start" | "end" }> = {
  FS: { from: "end", to: "start" },
  SS: { from: "start", to: "start" },
  FF: { from: "end", to: "end" },
  SF: { from: "start", to: "end" },
};

/** How far an elbow stands off a bar before it turns, in pixels. */
const STANDOFF = 10;
const HEAD = 4;

export function WbsDependencyArrows({
  scrollRef,
  links,
  wbs,
  geometryKey,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  links: readonly WbsLink[];
  wbs: Wbs;
  /** Changes whenever anything that moves a bar changes, so the layer re-measures. */
  geometryKey: string;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || links.length === 0) {
      setSegments([]);
      return;
    }
    const box = container.getBoundingClientRect();
    const originX = box.left - container.scrollLeft;
    const originY = box.top - container.scrollTop;
    const barOf = (id: number) => {
      const el = container.querySelector(`[data-gantt-bar="${id}"]`);
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
      const from = barOf(link.predecessorId);
      const to = barOf(link.successorId);
      if (!from || !to) continue;
      const edges = EDGES[link.type];
      const x1 = edges.from === "end" ? from.right : from.left;
      const x2 = edges.to === "end" ? to.right : to.left;
      const out = edges.from === "end" ? x1 + STANDOFF : x1 - STANDOFF;
      const into = edges.to === "end" ? x2 + STANDOFF : x2 - STANDOFF;
      const d = `M ${x1} ${from.middle} H ${out} V ${to.middle} H ${into} H ${x2}`;
      // The head points the way the arrow arrives: into a start edge from the left, into an end
      // edge from the right.
      const dir = edges.to === "end" ? 1 : -1;
      const head = `M ${x2} ${to.middle} l ${dir * HEAD} ${-HEAD} M ${x2} ${to.middle} l ${dir * HEAD} ${HEAD}`;
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
  }, [scrollRef, links, wbs, geometryKey]);

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
