"use client";

import { useEffect, useRef, useState } from "react";
import { messages } from "@/lib/messages";
import { AnchoredPanel } from "./dialog";
import { panelPosition, type PanelPosition } from "./data-view/datasheet";

export type NoteSaveState = "idle" | "saving" | "saved" | "failed";

const AUTOSAVE_MS = 800;
const NOTE_SIZE = { minWidth: 320, minBelow: 220 };

/**
 * A yellow sticky note behind a button. Typing saves on its own after a pause and on
 * close; one save runs at a time and the latest text always wins. A refused save keeps
 * the text in the note with a retry, so nothing typed is lost.
 * `onSave` resolves true once the text is stored. `readOnly` shows the note without editing it.
 */
export function NotePopover({
  label,
  value,
  maxLength,
  onSave,
  disabled = false,
  readOnly = false,
  tabIndex,
  testId,
  triggerClassName = "",
  children,
}: {
  label: string;
  value: string | null;
  maxLength: number;
  onSave: (text: string) => Promise<boolean>;
  disabled?: boolean;
  readOnly?: boolean;
  tabIndex?: number;
  testId?: string;
  triggerClassName?: string;
  children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [draft, setDraft] = useState(value ?? "");
  const [state, setState] = useState<NoteSaveState>("idle");
  const latest = useRef(value ?? "");
  const saved = useRef(value ?? "");
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (position || latest.current !== saved.current) return;
    latest.current = value ?? "";
    saved.current = value ?? "";
    setDraft(value ?? "");
  }, [value, position]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function flush() {
    window.clearTimeout(timer.current);
    if (busy.current) return;
    busy.current = true;
    try {
      while (latest.current !== saved.current) {
        const text = latest.current;
        setState("saving");
        if (!(await onSave(text))) {
          setState("failed");
          return;
        }
        saved.current = text;
        setState("saved");
      }
    } finally {
      busy.current = false;
    }
  }

  function edit(text: string) {
    if (readOnly) return;
    latest.current = text;
    setDraft(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  function open() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(
      panelPosition(rect, { width: window.innerWidth, height: window.innerHeight }, NOTE_SIZE),
    );
  }

  function close() {
    setPosition(null);
    void flush();
  }

  // The panel's own focus return does not reach a trigger inside a WBS box, so Escape hands it back.
  function dismiss() {
    close();
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={position !== null}
        title={label}
        tabIndex={tabIndex}
        data-testid={testId}
        disabled={disabled}
        onClick={() => (position ? close() : open())}
        className={`relative ${triggerClassName}`}
      >
        {children}
        {state === "failed" ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger"
          />
        ) : null}
      </button>
      {position ? (
        <AnchoredPanel
          open
          title={label}
          style={{ ...position }}
          testId={testId ? `${testId}-panel` : undefined}
          onEscape={dismiss}
          onOutside={(target) => {
            if (target && buttonRef.current?.contains(target)) return;
            close();
          }}
        >
          <textarea
            aria-label={label}
            value={draft}
            maxLength={maxLength}
            readOnly={readOnly}
            onChange={(event) => edit(event.target.value)}
            rows={8}
            autoFocus
            className="w-full resize-y rounded-md border border-tone-yellow-ink/30 bg-tone-yellow-soft p-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-coral"
          />
          <p role="status" className="flex min-h-6 items-center gap-2 text-xs text-ink-muted">
            {state === "saving" ? messages.feedback.savingState : null}
            {state === "saved" ? messages.feedback.saved : null}
            {state === "failed" ? (
              <>
                <span className="text-danger">{messages.feedback.notSaved}</span>
                <button
                  type="button"
                  onClick={() => void flush()}
                  className="rounded-sm underline underline-offset-2 hover:text-ink"
                >
                  {messages.feedback.retry}
                </button>
              </>
            ) : null}
          </p>
        </AnchoredPanel>
      ) : null}
    </>
  );
}
