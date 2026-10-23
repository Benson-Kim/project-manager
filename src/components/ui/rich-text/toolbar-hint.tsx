"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { shiftIntoView } from "@/components/ui/menu";
import { hintText } from "./toolbar-model";

/**
 * The formatting toolbar's hover hints (ADR-0042): a control's name and shortcut, under it.
 * Shown after HINT_DELAY_MS of mouse hover (at once while another hint shows or just did) and
 * at once on keyboard focus. It stays while the pointer is over the control or the hint, and
 * Escape (eaten, so it never also closes the editor's panel), a click, Enter, Space or a
 * shortcut hides it (WCAG 1.4.13). aria-hidden: the control already carries the same name
 * (aria-label) and shortcut (aria-keyshortcuts). Clicks pass through it to the text below.
 */
const HINT_DELAY_MS = 500;
const WARM_MS = 300;
const GAP_PX = 4;

type Box = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

/** Centred under the control and inside the window, in the toolbar's coordinates. */
export function hintPlacement(
  control: Box,
  toolbar: Box,
  hintWidth: number,
  windowWidth: number,
): { left: number; top: number } {
  const left = (control.left + control.right) / 2 - hintWidth / 2;
  const shift = shiftIntoView(left, left + hintWidth, windowWidth);
  return { left: left + shift - toolbar.left, top: control.bottom - toolbar.top + GAP_PX };
}

/** Whether a point is over the control, the hint or the gap between them. */
export function overHint(x: number, y: number, control: Box, hint: Box): boolean {
  return (
    x >= Math.min(control.left, hint.left) &&
    x <= Math.max(control.right, hint.right) &&
    y >= Math.min(control.top, hint.top) &&
    y <= Math.max(control.bottom, hint.bottom)
  );
}

interface Shown {
  control: HTMLElement;
  hover: boolean;
  focus: boolean;
}

export function ToolbarHint({
  toolbar,
  controlOf,
}: {
  toolbar: React.RefObject<HTMLElement | null>;
  /** The toolbar control an event target belongs to, or null. */
  controlOf: (target: EventTarget | null) => HTMLElement | null;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  const shownRef = useRef<Shown | null>(null);
  const hintRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = toolbar.current;
    if (!root) return;
    let timer: number | undefined;
    let warmUntil = 0;
    let hovered: HTMLElement | null = null;
    // Clicked or dismissed: no hover hint for it until the pointer leaves it.
    let suppressed: HTMLElement | null = null;
    // A control focused by a click (a select) gets no focus hint; one reached by keys does.
    let lastInput: "pointer" | "key" = "key";
    // Where the mouse last was, on the screen: a scroll moves the page under a still mouse.
    let mouse = { x: Number.NaN, y: Number.NaN };

    const update = (next: Shown | null) => {
      shownRef.current = next;
      setShown(next);
    };
    const show = (control: HTMLElement, source: "hover" | "focus") => {
      if (root.querySelector('[aria-expanded="true"]')) return;
      const current = shownRef.current?.control === control ? shownRef.current : null;
      update({
        control,
        hover: source === "hover" || (current?.hover ?? false),
        focus: source === "focus" || (current?.focus ?? false),
      });
    };
    const drop = (source: "hover" | "focus") => {
      const current = shownRef.current;
      if (!current) return;
      const next = { ...current, [source]: false };
      if (source === "hover") warmUntil = performance.now() + WARM_MS;
      update(next.hover || next.focus ? next : null);
    };
    const hide = () => {
      window.clearTimeout(timer);
      update(null);
    };

    const enter = (control: HTMLElement) => {
      hovered = control;
      window.clearTimeout(timer);
      if (control === suppressed) return;
      if (shownRef.current || performance.now() < warmUntil) show(control, "hover");
      else timer = window.setTimeout(() => show(control, "hover"), HINT_DELAY_MS);
    };
    const onPointerOut = (event: PointerEvent) => {
      const control = controlOf(event.target);
      if (!control || control.contains(event.relatedTarget as Node | null)) return;
      if (hovered === control) hovered = null;
      if (suppressed === control) suppressed = null;
      window.clearTimeout(timer);
      if (!event.relatedTarget) drop("hover");
    };
    // Hover starts on a move of the mouse itself, not when a scroll (focus moving into the
    // toolbar) slides a control under it: that would swap a focus hint for another control's.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (event.screenX === mouse.x && event.screenY === mouse.y) return;
      mouse = { x: event.screenX, y: event.screenY };
      const entered = controlOf(event.target);
      if (entered && entered !== hovered) enter(entered);
      const current = shownRef.current;
      const hint = hintRef.current;
      if (!current?.hover || !hint) return;
      const control = current.control.getBoundingClientRect();
      if (!overHint(event.clientX, event.clientY, control, hint.getBoundingClientRect())) {
        drop("hover");
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const control = controlOf(event.target);
      if (control && lastInput === "key" && control.matches(":focus-visible"))
        show(control, "focus");
    };
    const onFocusOut = (event: FocusEvent) => {
      const control = controlOf(event.target);
      if (control && shownRef.current?.control === control) drop("focus");
    };
    const onPointerDown = () => {
      lastInput = "pointer";
      suppressed = hovered;
      if (shownRef.current) hide();
      else window.clearTimeout(timer);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      lastInput = "key";
      if (!shownRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        suppressed = hovered;
        hide();
      } else if (event.key === "Enter" || event.key === " " || event.ctrlKey || event.metaKey) {
        hide();
      }
    };

    root.addEventListener("pointerout", onPointerOut);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerdown", onPointerDown, true);
    // On window, before the document listeners of a dialog or panel that closes on Escape.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [toolbar, controlOf]);

  // Placed before paint, after the text is in, so it never shows in the wrong place.
  useLayoutEffect(() => {
    const hint = hintRef.current;
    const root = toolbar.current;
    if (!shown || !hint || !root) return;
    const { left, top } = hintPlacement(
      shown.control.getBoundingClientRect(),
      root.getBoundingClientRect(),
      hint.offsetWidth,
      document.documentElement.clientWidth,
    );
    hint.style.left = `${left}px`;
    hint.style.top = `${top}px`;
  }, [shown, toolbar]);

  const visible = shown?.control.isConnected ? shown.control : null;
  return (
    <span
      ref={hintRef}
      aria-hidden="true"
      hidden={!visible}
      data-testid="rich-text-hint"
      className="pointer-events-none absolute z-(--z-dropdown) rounded bg-ink px-2 py-1 text-xs whitespace-nowrap text-surface shadow-md"
    >
      {visible
        ? hintText(
            visible.getAttribute("aria-label") ?? "",
            visible.getAttribute("aria-keyshortcuts"),
          )
        : null}
    </span>
  );
}
