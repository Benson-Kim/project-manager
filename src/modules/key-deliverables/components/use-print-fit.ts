"use client";

import { useEffect, type RefObject } from "react";

/** A4 landscape inside the print margins (globals.css @page: 297 mm less 2 × 10 mm), in CSS px. */
export const PRINT_WIDTH_PX = Math.floor(((297 - 20) / 25.4) * 96);

/** How much a chart this wide must shrink to fit the printed page; it never grows. */
export function printZoom(contentWidth: number, pageWidth = PRINT_WIDTH_PX): number {
  if (!(contentWidth > pageWidth)) return 1;
  return Math.floor((pageWidth / contentWidth) * 1000) / 1000;
}

/**
 * Prints the whole chart in `ref` across the page: just before printing its width is measured
 * and --print-zoom set on it (the [data-print-fit] print rule applies it); afterwards it goes.
 */
export function usePrintFit(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const before = () => {
      const el = ref.current;
      if (el) el.style.setProperty("--print-zoom", String(printZoom(el.scrollWidth)));
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
