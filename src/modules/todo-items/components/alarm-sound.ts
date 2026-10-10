"use client";

/**
 * The to-do alarm's chime (client feedback: "the alert showed but without a
 * sound"). A short two-tone chime synthesised with Web Audio — no asset to
 * load. Browsers only let a page play sound after the user has interacted with
 * it, so the audio context is created (or resumed) on the first click or key
 * press anywhere in the app. An alarm that comes due before that chimes on the
 * first gesture; the toast, the bell and the desktop notification (which may
 * sound by itself) show at once either way.
 */

let context: AudioContext | null = null;
let armed = false;
/** An alarm arrived before the browser allowed sound: chime on the first gesture. */
let owed = false;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** Arms the chime on the first user gesture (call once when the app shell mounts). */
export function armAlarmSound(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const unlock = () => {
    void audioContext()
      ?.resume()
      .then(() => {
        if (owed) {
          owed = false;
          playAlarmChime();
        }
      })
      .catch(() => undefined);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

/** One note: a soft attack and decay so it never clicks. */
function note(ctx: AudioContext, frequency: number, start: number, length: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.05);
}

/** Plays the chime now if the browser allows sound, else on the first click or key press. */
export function playAlarmChime(): void {
  const ctx = context;
  if (!ctx || ctx.state !== "running") {
    owed = true;
    return;
  }
  const now = ctx.currentTime;
  note(ctx, 880, now, 0.35); // A5
  note(ctx, 1318.5, now + 0.18, 0.5); // E6
}
