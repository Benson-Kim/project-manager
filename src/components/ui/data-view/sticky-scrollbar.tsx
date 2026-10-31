"use client";

import { useEffect, useRef, useState } from "react";
import { fitHeight, stretchBelow, type FitLevel } from "./fit-height";

/**
 * A second horizontal scrollbar for a wide table, pinned to the bottom of the
 * viewport (client feedback, 2026-10-23). The table's own scrollbar sits at the
 * bottom edge of its box, which is a screen tall, so reaching it means scrolling
 * past every row first. This one mirrors it and stays in reach while any part of
 * the list is on screen.
 *
 * It renders only while the table is actually wider than its box, and it scrolls
 * nothing of its own — both scrollers write each other's `scrollLeft`.
 *
 * It is the list's one horizontal scrollbar: it publishes the height of the box's own
 * bar as `--hbar`, and the box hangs that bar below a clip (data-view.tsx). The bar's
 * height depends on the platform (0 where scrollbars overlay), so it is measured.
 */
/**
 * Where a node's in-flow children end: the lowest bottom among them, so a row of panels ends at
 * its tallest one. Hidden and out-of-flow children end nowhere. Null when none takes room.
 */
function childrenBottom(node: Element): number | null {
  let bottom: number | null = null;
  for (const child of node.children) {
    if (child.getClientRects().length === 0) continue;
    const style = getComputedStyle(child);
    if (style.position === "absolute" || style.position === "fixed") continue;
    const end = child.getBoundingClientRect().bottom + parseFloat(style.marginBottom);
    bottom = bottom === null ? end : Math.max(bottom, end);
  }
  return bottom;
}

/** Each ancestor of the box up to the page, as fitHeight needs it. */
function levelsAbove(target: HTMLElement): FitLevel[] {
  const levels: FitLevel[] = [];
  for (let node = target.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    levels.push({
      contentBottom:
        node.getBoundingClientRect().bottom -
        parseFloat(style.paddingBottom) -
        parseFloat(style.borderBottomWidth),
      childrenBottom: childrenBottom(node),
    });
  }
  return levels;
}

/** The box's `--fit-h`: the window less what sits above and below it, never the stretch. */
function measureFit(target: HTMLElement): number {
  const doc = document.documentElement;
  const rect = target.getBoundingClientRect();
  return fitHeight({
    viewport: doc.clientHeight,
    top: rect.top + window.scrollY,
    below: doc.scrollHeight - (rect.bottom + window.scrollY),
    stretch: stretchBelow(levelsAbove(target)),
  });
}

export function StickyScrollbar({ targetRef }: { targetRef: React.RefObject<HTMLElement | null> }) {
  const proxyRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    const proxy = proxyRef.current;
    if (!target || !proxy) return;

    const measure = () => {
      // The box's vertical scrollbar narrows its view, not this bar's: adding its width
      // gives both the same range, so this bar reaches the last column too.
      setWidth(target.scrollWidth + target.offsetWidth - target.clientWidth);
      // A sub-pixel difference is a rounded layout, not an overflow.
      setOverflows(target.scrollWidth - target.clientWidth > 1);
      target.style.setProperty("--hbar", `${target.offsetHeight - target.clientHeight}px`);
      target.style.setProperty("--fit-h", `${measureFit(target)}px`);
    };
    measure();

    // Mirroring without a feedback loop: writing the value a scroller already
    // has does nothing, so the echoed scroll event ends here.
    const follow = (from: HTMLElement, to: HTMLElement) => () => {
      if (to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
    };
    const onTarget = follow(target, proxy);
    const onProxy = follow(proxy, target);
    target.addEventListener("scroll", onTarget, { passive: true });
    proxy.addEventListener("scroll", onProxy, { passive: true });

    // The box resizes with the window; the table resizes when a column does.
    const resize = new ResizeObserver(measure);
    resize.observe(target);
    if (target.firstElementChild) resize.observe(target.firstElementChild);
    // What sits above or below it can change height too, and so can the window.
    resize.observe(document.body);
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      target.removeEventListener("scroll", onTarget);
      proxy.removeEventListener("scroll", onProxy);
      resize.disconnect();
    };
  }, [targetRef]);

  return (
    <div
      ref={proxyRef}
      data-testid="sticky-scrollbar"
      // The same scroll as the table's own, so it is a pointer affordance and
      // not a second control: assistive technology and the tab order keep the
      // scroller it mirrors, which is the one that holds the rows.
      aria-hidden="true"
      tabIndex={-1}
      hidden={!overflows}
      className="sticky bottom-0 z-20 overflow-x-auto overflow-y-hidden print:hidden sticky-scroller"
    >
      <div style={{ width }} className="h-px" />
    </div>
  );
}
