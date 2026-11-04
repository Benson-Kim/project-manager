import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: how the plan views read (client feedback, 2026-11-02) — a WBS box in its status's
 * colour, and a chart that scrolls inside itself in full screen so the Gantt's date row stays in
 * view. Nothing browser-shaped runs here, so what is held is the construction each one depends on.
 */
const DIAGRAM = "src/modules/key-deliverables/components/wbs-diagram.tsx";
const BOARD = "src/modules/key-deliverables/components/gantt-board.tsx";
const CONTAINER = "src/modules/key-deliverables/components/wbs-gantt.tsx";

const source = (path: string) => readFileSync(path, "utf8");

describe("a WBS box carries its status's colour", () => {
  const shape = (() => {
    const text = source(DIAGRAM);
    const start = text.indexOf("function boxShape(");
    expect(start, `${DIAGRAM}: function boxShape`).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf("\n}", start));
  })();

  it("takes the item's own colour first and its status's next", () => {
    expect(shape).toContain("node.item.color ?? status ?? NO_STATUS_COLOR");
  });

  it("fills the top level and stripes the levels below it", () => {
    expect(shape).toContain("tone.swatch");
    expect(shape).toContain("border-l-4 bg-surface ${tone.bar}");
  });

  it("writes the name on the box, not on a pill of its own", () => {
    // The rebuilt box sat the code and name on a white pill over a block of level colour; the
    // client asked for the flat box back, so a surface fill inside the head row must not return.
    expect(source(DIAGRAM)).not.toContain("flex-1 items-start gap-1.5 rounded-lg bg-surface p-2");
  });
});

const CHARTS = [
  { what: "the WBS chart", file: DIAGRAM, floor: "min-h-90" },
  { what: "the Gantt", file: BOARD, floor: "min-h-64" },
] as const;

describe("full screen puts both scrollbars on the chart", () => {
  it("tells each chart it is full screen", () => {
    const container = source(CONTAINER);
    expect(container).toContain('fullscreen.active ? "fixed inset-0');
    expect(container.match(/fullscreen=\{fullscreen\.active\}/g)).toHaveLength(CHARTS.length);
  });

  describe.each(CHARTS)("$what", (chart) => {
    const text = source(chart.file);

    it("fills the room the window leaves, with a floor so it cannot collapse", () => {
      expect(text).toContain(`fullscreen ? "flex ${chart.floor} flex-1 flex-col" : ""`);
      expect(text).toContain('fullscreen ? "min-h-0 flex-1" : ""');
    });

    it("scrolls inside itself and hides its own horizontal bar under the clip", () => {
      // Without the extra --hbar the box's own bar lands inside the clip and a second one shows.
      expect(text).toContain("h-[calc(100%+var(--hbar,0px))]");
      expect(text).toContain("mb-[calc(var(--hbar,0px)*-1)]");
    });
  });

  it("gives the WBS chart a vertical scrollbar it does not have on the page", () => {
    const text = source(DIAGRAM);
    expect(text).toContain('"h-[calc(100%+var(--hbar,0px))] overflow-auto"');
    expect(text).toContain('"min-h-90 overflow-x-auto overflow-y-hidden"');
  });
});

describe("the Gantt keeps its dates at the top", () => {
  it("sticks the date row to the top of the box that scrolls", () => {
    expect(source(BOARD)).toContain('className="sticky top-0 z-20 flex h-10 bg-surface"');
  });
});
