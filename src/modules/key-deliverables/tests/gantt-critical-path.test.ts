import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { criticalPath } from "../schemas/critical-path";
import { buildWbs, itemProgress, type WbsItem } from "../schemas/wbs";
import type { DependencyType, WbsLink } from "../schemas/wbs-dependencies";
import { GanttBoard } from "../components/gantt-board";
import { GanttCard, GanttMilestone } from "../components/gantt-card";
import { makeTimeline } from "../components/gantt-scale";
import { GanttTools } from "../components/gantt-tools";
import { DEFAULT_GANTT_DISPLAY, readStoredGanttDisplay } from "../components/use-gantt-display";
import { readGanttDisplay } from "../components/gantt-layout";
import { dependencyArrowStyle } from "../components/wbs-dependency-arrows";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function item(
  id: number,
  parentId: number | null,
  start?: string,
  end?: string,
  isMilestone = false,
): WbsItem {
  return {
    id,
    parentId,
    sortOrder: id,
    name: `Item ${id}`,
    requestedDate: null,
    start: start ? d(start) : null,
    end: end ? d(end) : null,
    actualDate: null,
    status: null,
    priority: null,
    color: null,
    isMilestone,
    assigneeNames: null,
    assignees: [],
    requirements: [],
    budget: null,
    note: null,
    rowVer: id * 100,
  };
}

function link(
  id: number,
  predecessorId: number,
  successorId: number,
  type: DependencyType = "FS",
  lagDays = 0,
): WbsLink {
  return { id, predecessorId, successorId, type, lagDays, rowVer: 1 };
}

describe("readGanttDisplay & readStoredGanttDisplay", () => {
  it("reads valid settings including criticalPath", () => {
    const raw = JSON.stringify({
      progress: false,
      dates: true,
      today: false,
      assignees: true,
      milestones: false,
      criticalPath: true,
    });
    expect(readStoredGanttDisplay(raw)).toEqual({
      progress: false,
      dates: true,
      today: false,
      assignees: true,
      milestones: false,
      criticalPath: true,
    });
  });

  it("fills missing fields from defaults and rejects non-boolean values", () => {
    expect(
      readGanttDisplay({ criticalPath: "true", dates: 1, progress: false }, DEFAULT_GANTT_DISPLAY),
    ).toEqual({
      ...DEFAULT_GANTT_DISPLAY,
      progress: false,
    });
  });

  it("handles null, undefined, primitives, arrays, and corrupted JSON", () => {
    expect(readGanttDisplay(null, DEFAULT_GANTT_DISPLAY)).toEqual(DEFAULT_GANTT_DISPLAY);
    expect(readGanttDisplay(undefined, DEFAULT_GANTT_DISPLAY)).toEqual(DEFAULT_GANTT_DISPLAY);
    expect(readGanttDisplay(42, DEFAULT_GANTT_DISPLAY)).toEqual(DEFAULT_GANTT_DISPLAY);
    expect(readGanttDisplay("criticalPath", DEFAULT_GANTT_DISPLAY)).toEqual(DEFAULT_GANTT_DISPLAY);
    expect(readGanttDisplay([true, false], DEFAULT_GANTT_DISPLAY)).toEqual(DEFAULT_GANTT_DISPLAY);
    expect(readStoredGanttDisplay(null)).toEqual(DEFAULT_GANTT_DISPLAY);
    expect(readStoredGanttDisplay("{not-json")).toEqual(DEFAULT_GANTT_DISPLAY);
  });

  it("ignores prototype-pollution payloads", () => {
    const payload = JSON.parse(
      '{"__proto__":{"criticalPath":true},"constructor":{"prototype":{"dates":false}}}',
    );
    const parsed = readGanttDisplay(payload, DEFAULT_GANTT_DISPLAY);
    expect(parsed).toEqual(DEFAULT_GANTT_DISPLAY);
    expect(({} as Record<string, unknown>).criticalPath).toBeUndefined();
  });
});

describe("dependencyArrowStyle", () => {
  it("returns distinct styles for all 4 (satisfied, critical) combinations", () => {
    expect(dependencyArrowStyle(true, false)).toEqual({
      className: "stroke-ink-muted",
      strokeWidth: 1.5,
      strokeDasharray: undefined,
    });
    expect(dependencyArrowStyle(false, false)).toEqual({
      className: "stroke-danger",
      strokeWidth: 1.5,
      strokeDasharray: "3 2",
    });
    expect(dependencyArrowStyle(true, true)).toEqual({
      className: "stroke-danger",
      strokeWidth: 2.75,
      strokeDasharray: undefined,
    });
    expect(dependencyArrowStyle(false, true)).toEqual({
      className: "stroke-danger",
      strokeWidth: 2.75,
      strokeDasharray: "6 2",
    });
  });
});

describe("GanttTools critical path toggle", () => {
  const baseProps = {
    addItem: { run: () => {}, hidden: false },
    addMilestone: { run: () => {}, hidden: false },
    onCopySummary: () => {},
    onDisplay: () => {},
  };

  it("renders toggle off without undated note", () => {
    const html = renderToStaticMarkup(
      React.createElement(GanttTools, {
        ...baseProps,
        display: DEFAULT_GANTT_DISPLAY,
        undatedCount: 2,
      }),
    );
    expect(html).toContain('data-testid="gantt-tools-critical-path"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('data-testid="gantt-critical-path-undated"');
  });

  it("renders toggle on and undated exclusion count when > 0", () => {
    const active = { ...DEFAULT_GANTT_DISPLAY, criticalPath: true };
    const zeroHtml = renderToStaticMarkup(
      React.createElement(GanttTools, { ...baseProps, display: active, undatedCount: 0 }),
    );
    expect(zeroHtml).toContain('aria-pressed="true"');
    expect(zeroHtml).not.toContain('data-testid="gantt-critical-path-undated"');

    const oneHtml = renderToStaticMarkup(
      React.createElement(GanttTools, { ...baseProps, display: active, undatedCount: 1 }),
    );
    expect(oneHtml).toContain('data-testid="gantt-critical-path-undated"');
    expect(oneHtml).toContain("1 undated item excluded");

    const threeHtml = renderToStaticMarkup(
      React.createElement(GanttTools, { ...baseProps, display: active, undatedCount: 3 }),
    );
    expect(threeHtml).toContain("3 undated items excluded");
  });
});

describe("GanttCard, GanttMilestone, and GanttBoard critical path rendering", () => {
  it("marks critical card, expanded critical tile, and critical milestone while leaving slack unmarked", () => {
    const items: WbsItem[] = [
      item(1, null, "2026-01-01", "2026-01-05"),
      item(2, null),
      item(3, 2, "2026-01-06", "2026-01-10"),
      item(4, 3),
      item(5, 4, "2026-01-06", "2026-01-10"),
      item(6, null, "2026-01-10", "2026-01-10", true),
      item(7, null, "2026-01-01", "2026-01-03"),
      item(8, null, "2026-01-02", "2026-01-02", true),
    ];
    const links: WbsLink[] = [link(1, 1, 5, "FS")];
    const wbs = buildWbs(items);
    const crit = criticalPath(wbs, links);

    expect(crit.itemIds.has(1)).toBe(true);
    expect(crit.itemIds.has(2)).toBe(true);
    expect(crit.itemIds.has(3)).toBe(true);
    expect(crit.itemIds.has(4)).toBe(true);
    expect(crit.itemIds.has(5)).toBe(true);
    expect(crit.itemIds.has(6)).toBe(true);
    expect(crit.itemIds.has(7)).toBe(false);
    expect(crit.itemIds.has(8)).toBe(false);

    const critCardHtml = renderToStaticMarkup(
      React.createElement(GanttCard, {
        node: wbs.nodes.get(4)!,
        tiles: [{ node: wbs.nodes.get(5)!, depth: 1 }],
        progress: 0,
        display: DEFAULT_GANTT_DISPLAY,
        open: true,
        selected: false,
        critical: crit.itemIds.has(4),
        criticalIds: crit.itemIds,
        listing: false,
        resizable: false,
        dragging: false,
        onSelect: () => {},
        onToggle: () => {},
        onRequirements: () => {},
      }),
    );
    expect(critCardHtml).toContain('data-testid="gantt-card-4" data-critical="true"');
    expect(critCardHtml).toContain("border-danger");
    expect(critCardHtml).toContain("outline-danger");
    expect(critCardHtml).toContain("on a critical path");
    expect(critCardHtml).toContain('data-testid="gantt-tile-5" data-critical="true"');

    const slackCardHtml = renderToStaticMarkup(
      React.createElement(GanttCard, {
        node: wbs.nodes.get(7)!,
        tiles: [],
        progress: 0,
        display: DEFAULT_GANTT_DISPLAY,
        open: false,
        selected: false,
        critical: crit.itemIds.has(7),
        criticalIds: crit.itemIds,
        listing: false,
        resizable: false,
        dragging: false,
        onSelect: () => {},
        onToggle: () => {},
        onRequirements: () => {},
      }),
    );
    expect(slackCardHtml).not.toContain('data-critical="true"');
    expect(slackCardHtml).not.toContain("on a critical path");

    const critMilestoneHtml = renderToStaticMarkup(
      React.createElement(GanttMilestone, {
        node: wbs.nodes.get(6)!,
        reached: true,
        selected: false,
        critical: crit.itemIds.has(6),
        onSelect: () => {},
      }),
    );
    expect(critMilestoneHtml).toContain('data-critical="true"');
    expect(critMilestoneHtml).toContain("border-danger");
    expect(critMilestoneHtml).toContain("outline-danger");
    expect(critMilestoneHtml).toContain("on a critical path");

    const slackMilestoneHtml = renderToStaticMarkup(
      React.createElement(GanttMilestone, {
        node: wbs.nodes.get(8)!,
        reached: false,
        selected: false,
        critical: crit.itemIds.has(8),
        onSelect: () => {},
      }),
    );
    expect(slackMilestoneHtml).not.toContain('data-critical="true"');
    expect(slackMilestoneHtml).not.toContain("on a critical path");

    const timeline = makeTimeline(
      "day",
      { min: d("2026-01-01"), max: d("2026-01-12") },
      d("2026-01-01"),
    );
    const boardHtml = renderToStaticMarkup(
      React.createElement(GanttBoard, {
        scrollRef: { current: null },
        wbs,
        links,
        timeline,
        today: d("2026-01-01"),
        display: { ...DEFAULT_GANTT_DISPLAY, criticalPath: true },
        progress: itemProgress(wbs),
        milestones: [],
        criticalIds: crit.itemIds,
        criticalLinkIds: crit.linkIds,
        selectedId: null,
        listingId: null,
        on: {
          select: () => {},
          requirements: () => {},
          menu: () => {},
          open: () => {},
          flush: () => {},
        },
      }),
    );
    expect(boardHtml).toContain('data-testid="gantt-group-2-pill" data-critical="true"');
    expect(boardHtml).toContain('data-testid="gantt-lane-3-label" data-critical="true"');
  });
});
