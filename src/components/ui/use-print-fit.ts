"use client";

import { useEffect, type RefObject } from "react";

/** A4 landscape inside the print margins (globals.css @page: 297 mm less 2 × 10 mm), in CSS px. */
export const PRINT_WIDTH_PX = Math.floor(((297 - 20) / 25.4) * 96);

/** How much content this wide must shrink to fit the printed page; it never grows. */
export function printZoom(contentWidth: number, pageWidth = PRINT_WIDTH_PX): number {
  if (!(contentWidth > pageWidth)) return 1;
  return Math.floor((pageWidth / contentWidth) * 1000) / 1000;
}

/** The shell wrappers the print stylesheet strips of padding and borders (globals.css, Gantt report). */
const PRINT_STRIPPED = "body, body > div, body > div > div";

/** The side padding and borders that `el`'s containers keep on the printed page. */
function insetWithinPage(el: HTMLElement): number {
  let inset = 0;
  for (
    let box = el.parentElement;
    box && box !== document.documentElement;
    box = box.parentElement
  ) {
    if (box.matches(PRINT_STRIPPED)) continue;
    const style = getComputedStyle(box);
    inset +=
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight) +
      parseFloat(style.borderLeftWidth) +
      parseFloat(style.borderRightWidth);
  }
  return inset;
}

/**
 * Prints all of `ref` across the page (a chart, a wide table): just before printing its width is
 * measured at the page's width in the print layout ([data-print-measure]) and --print-zoom set on
 * it (the [data-print-fit] print rule applies it); afterwards it goes.
 */
export function usePrintFit(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const before = () => {
      const el = ref.current;
      if (!el) return;
      const available = PRINT_WIDTH_PX - insetWithinPage(el);
      el.setAttribute("data-print-measure", "");
      el.style.width = `${available}px`;
      const width = el.scrollWidth;
      el.style.removeProperty("width");
      el.removeAttribute("data-print-measure");
      el.style.setProperty("--print-zoom", String(printZoom(width, available)));
    };
    const after = () => ref.current?.style.removeProperty("--print-zoom");
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [ref]);
}
