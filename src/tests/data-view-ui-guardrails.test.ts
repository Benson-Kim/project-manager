import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: the two things a long, wide list has to keep in reach — the column
 * headers while you scroll down, and a horizontal scrollbar without scrolling
 * down first (client feedback, 2026-10-23).
 *
 * Neither can be proven here (nothing browser-shaped runs in this workspace), so
 * what is held is the construction each one depends on. Both failed in ways that
 * read as working code: stickiness declared on the `<thead>` alone leaves the
 * stuck row without its grid lines, because `border-collapse` paints the borders
 * on the table and the table scrolls away; and a scrollbar mirror that assigns
 * `scrollLeft` unconditionally echoes its own event back for ever.
 */
const CELLS = "src/components/ui/data-view/datasheet-cells.tsx";
const VIEW = "src/components/ui/data-view/data-view.tsx";
const BAR = "src/components/ui/data-view/sticky-scrollbar.tsx";
const CSS = "src/app/globals.css";

const source = (path: string) => readFileSync(path, "utf8");

/** The one class string every cell of the header row is built from. */
function headerCell(): string {
  const text = source(CELLS);
  const start = text.indexOf("export const headerCellClass =");
  expect(start, `${CELLS}: export const headerCellClass`).toBeGreaterThan(-1);
  const end = text.indexOf(";", start);
  return text.slice(start, end);
}

describe("the header row sticks to the top of the table's scroll box", () => {
  it("puts the stickiness on the cells, not only on the <thead>", () => {
    expect(headerCell()).toContain("sticky top-0");
  });

  it("keeps the header above the row-resize handles inside the box", () => {
    // The handles are z-10; the app header above the box is its own layer.
    expect(headerCell()).toContain("z-20");
  });

  it("gives the stuck cells their own opaque background", () => {
    // A transparent header would show the rows passing underneath it.
    expect(headerCell()).toContain("bg-surface-raised");
  });

  it("redraws the edges that border-collapse takes away while stuck", () => {
    expect(headerCell()).toContain("shadow-[inset_0_-1px_0_var(--line)");
  });

  it("stops sticking, and drops the shadow, on paper", () => {
    const th = headerCell();
    expect(th).toContain("print:static");
    expect(th).toContain("print:shadow-none");
  });

  it("is the one class every cell of the header row is built from", () => {
    // A cell left out would scroll away on its own: the select-all column and
    // the actions column are not HeaderCells.
    const view = source(VIEW);
    expect(view.match(/\$\{headerCellClass\}/g)).toHaveLength(2);
    expect(source(CELLS)).toContain("`${headerCellClass} px-3 py-2");
  });

  it("keeps the scroll box that the header sticks to", () => {
    // A horizontal scroller captures vertical stickiness, so the table scrolls
    // in its own box and the header sticks to that, not to the page.
    expect(source(VIEW)).toContain('className="relative max-h-[calc(100dvh-5rem)]');
    expect(source(VIEW)).toContain("overflow-auto");
  });
});

describe("a wide table's horizontal scrollbar stays in reach", () => {
  const bar = source(BAR);

  it("is mounted with the table's own scroll box as its target", () => {
    expect(source(VIEW)).toContain("<StickyScrollbar targetRef={scrollerRef} />");
    // The ref and the test id belong to the same element: the box that scrolls.
    expect(source(VIEW)).toMatch(/ref=\{scrollerRef\}\s+data-testid="data-view-scroller"/);
  });

  it("pins itself to the bottom of the viewport", () => {
    expect(bar).toContain("sticky bottom-0");
  });

  it("mirrors only when a scroller already holds the value", () => {
    // `to.scrollLeft = from.scrollLeft` fires a scroll event on `to`, which
    // mirrors back: assigning only a different value ends the echo.
    expect(bar).toContain(
      "if (to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;",
    );
  });

  it("listens on both scrollers and lets go of both", () => {
    for (const fragment of [
      'target.addEventListener("scroll"',
      'proxy.addEventListener("scroll"',
      'target.removeEventListener("scroll"',
      'proxy.removeEventListener("scroll"',
      "resize.disconnect()",
    ]) {
      expect(bar).toContain(fragment);
    }
  });

  it("re-measures when the box or the table is resized", () => {
    // A column resize changes the table's width without a window event.
    expect(bar).toContain("new ResizeObserver(measure)");
    expect(bar).toContain("resize.observe(target)");
    expect(bar).toContain("resize.observe(target.firstElementChild)");
  });

  it("is not rendered while the table fits", () => {
    expect(bar).toContain("hidden={!overflows}");
    expect(bar).toContain("target.scrollWidth - target.clientWidth > 1");
  });

  it("stays out of the tab order and the accessibility tree", () => {
    // It duplicates a scroller that already holds the rows; two tab stops for
    // one scroll would be a second control, not an affordance.
    expect(bar).toContain('aria-hidden="true"');
    expect(bar).toContain("tabIndex={-1}");
  });

  it("is not printed", () => {
    expect(bar).toContain("print:hidden");
  });

  it("shows a bar where the platform overlays them", () => {
    // It is alone in its box, so an overlay scrollbar would leave it invisible.
    const css = source(CSS);
    expect(bar).toContain("sticky-scroller");
    expect(css).toContain(".sticky-scroller::-webkit-scrollbar");
    expect(css).toContain("scrollbar-width: thin");
  });
});
