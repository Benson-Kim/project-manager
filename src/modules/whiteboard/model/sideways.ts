/** A stretch of the board's x axis, in scene units. */
export type Span = { start: number; end: number };

const widthOf = (span: Span) => span.end - span.start;

/** The drawing plus one screen's width either side, always wide enough to hold what is on screen. */
export function sidewaysTrack(content: Span | null, view: Span): Span {
  const screen = widthOf(view);
  if (!content) return { start: view.start - screen, end: view.end + screen };
  return {
    start: Math.min(content.start - screen, view.start),
    end: Math.max(content.end + screen, view.end),
  };
}

/** Where the thumb sits on the track and how much of it it covers, both as fractions of the track. */
export function sidewaysThumb(track: Span, view: Span): { offset: number; size: number } {
  const length = widthOf(track);
  return { offset: (view.start - track.start) / length, size: widthOf(view) / length };
}

/** The scene x the screen's left edge moves to when the thumb's left edge is put at `fraction`. */
export function sidewaysStartAt(track: Span, view: Span, fraction: number): number {
  const length = widthOf(track);
  const last = 1 - widthOf(view) / length;
  return track.start + Math.min(Math.max(fraction, 0), last) * length;
}

/** How far along the track the screen is, 0 at the left end and 100 at the right, for screen readers. */
export function sidewaysPercent(track: Span, view: Span): number {
  const room = widthOf(track) - widthOf(view);
  return room > 0 ? Math.round(((view.start - track.start) / room) * 100) : 0;
}
