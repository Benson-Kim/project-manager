"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { messages } from "@/lib/messages";
import {
  sidewaysPercent,
  sidewaysStartAt,
  sidewaysThumb,
  sidewaysTrack,
  type Span,
} from "../model/sideways";

/** What the scrollbar needs from a board: where the drawing and the screen are, and a way to move. */
export type SidewaysSource = {
  read: () => { content: Span | null; view: Span };
  moveTo: (viewStart: number) => void;
  subscribe: (onChange: () => void) => () => void;
};

type Shown = { track: Span; view: Span };
type Drag = { pointerX: number; offset: number; track: Span };

const sameSpan = (a: Span, b: Span) => a.start === b.start && a.end === b.end;
const sameShown = (a: Shown, b: Shown) => sameSpan(a.track, b.track) && sameSpan(a.view, b.view);

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -0.1,
  ArrowRight: 0.1,
  PageUp: -1,
  PageDown: 1,
  Home: -Infinity,
  End: Infinity,
};

export function SidewaysScrollbar({
  source,
  controls,
}: {
  source: SidewaysSource;
  controls: string;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  const drag = useRef<Drag | null>(null);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const { content, view } = source.read();
      const track = drag.current?.track ?? sidewaysTrack(content, view);
      const next = { track, view };
      setShown((prev) => (prev && sameShown(prev, next) ? prev : next));
    };
    update();
    return source.subscribe(update);
  }, [source]);

  if (!shown) return null;
  const { track, view } = shown;
  const thumb = sidewaysThumb(track, view);
  const screen = view.end - view.start;
  const length = track.end - track.start;

  const moveBy = (screens: number) =>
    source.moveTo(
      sidewaysStartAt(track, view, (view.start + screens * screen - track.start) / length),
    );

  const onKeyDown = (event: KeyboardEvent) => {
    const step = KEY_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    moveBy(step);
  };

  const onRailDown = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = (event.clientX - box.left) / box.width;
    moveBy(at < thumb.offset ? -1 : 1);
  };

  const onThumbDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerX: event.clientX, offset: thumb.offset, track };
  };

  const onThumbMove = (event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    const width = rail.current?.clientWidth;
    if (!held || !width) return;
    const fraction = held.offset + (event.clientX - held.pointerX) / width;
    source.moveTo(sidewaysStartAt(held.track, view, fraction));
  };

  const onThumbUp = () => {
    drag.current = null;
    const { content } = source.read();
    setShown({ track: sidewaysTrack(content, view), view });
  };

  return (
    <div
      ref={rail}
      role="scrollbar"
      tabIndex={0}
      aria-label={messages.whiteboard.scrollSideways}
      aria-controls={controls}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={sidewaysPercent(track, view)}
      data-testid="whiteboard-scrollbar"
      onKeyDown={onKeyDown}
      onPointerDown={onRailDown}
      className="relative h-3.5 w-full shrink-0 touch-none border-t border-line bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus print:hidden"
    >
      <div
        data-testid="whiteboard-scrollbar-thumb"
        onPointerDown={onThumbDown}
        onPointerMove={onThumbMove}
        onPointerUp={onThumbUp}
        onPointerCancel={onThumbUp}
        style={{ left: `${thumb.offset * 100}%`, width: `${thumb.size * 100}%` }}
        className="absolute inset-y-0.5 cursor-grab rounded-full bg-ink-faint hover:bg-ink-muted active:cursor-grabbing"
      />
    </div>
  );
}
