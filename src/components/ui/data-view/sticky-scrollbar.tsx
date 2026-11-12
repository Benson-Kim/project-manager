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

/** Each ancestor of the box up to its frame (or the page), as fitHeight needs it. */
function levelsAbove(target: HTMLElement, frame: HTMLElement | null): FitLevel[] {
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
    if (node === frame) break;
  }
  return levels;
}

/**
 * The window the box fills: a full-page layer marked `data-fit-frame` when the box sits in one,
 * else the page. Measured against the page, a box in the layer counted the page behind it as room
 * below, grew to its whole content, and the layer scrolled the header row away instead of the box
 * (client feedback, 2026-11-12). `origin` is where the frame's content starts on screen.
 */
function frameOf(target: HTMLElement) {
  const frame = target.closest<HTMLElement>("[data-fit-frame]");
  if (!frame) {
    const doc = document.documentElement;
    return {
      frame,
      height: doc.clientHeight,
      scrollHeight: doc.scrollHeight,
      origin: -window.scrollY,
    };
  }
  return {
    frame,
    height: frame.clientHeight,
    scrollHeight: frame.scrollHeight,
    origin: frame.getBoundingClientRect().top + frame.clientTop - frame.scrollTop,
  };
}

/** The box's `--fit-h`: its window less what sits above and below it, never the stretch. */
function measureFit(target: HTMLElement): number {
  const { frame, height, scrollHeight, origin } = frameOf(target);
  const rect = target.getBoundingClientRect();
  return fitHeight({
    viewport: height,
    top: rect.top - origin,
    below: scrollHeight - (rect.bottom - origin),
    stretch: stretchBelow(levelsAbove(target, frame)),
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
    for (const child of target.children) resize.observe(child);
    // What sits above or below it can change height too, and so can the window.
    resize.observe(document.body);
    window.addEventListener("resize", measure);
    // A board's lanes are the box's children, so a lane added or removed widens the box's
    // content without resizing anything already observed.
    const children = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) if (node instanceof Element) resize.observe(node);
        for (const node of record.removedNodes) if (node instanceof Element) resize.unobserve(node);
      }
      measure();
    });
    children.observe(target, { childList: true });

    return () => {
      window.removeEventListener("resize", measure);
      target.removeEventListener("scroll", onTarget);
      proxy.removeEventListener("scroll", onProxy);
      children.disconnect();
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
