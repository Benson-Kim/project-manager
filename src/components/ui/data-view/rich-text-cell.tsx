"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { messages } from "@/lib/messages";
import { Button } from "../button";
import { AnchoredPanel, Dialog } from "../dialog";
import { RichTextEditor } from "../rich-text/rich-text-editor";
import { panelPosition, previewText, type PanelPosition } from "./datasheet";

type Mode = "closed" | "panel" | "zoom";

/** Clicks and keys inside the editor must not reach the row (open the record, row keys). */
const contain = (event: React.SyntheticEvent) => event.stopPropagation();

/**
 * A rich-text datasheet cell (ADR-0023 amendment, ADR-0025). Closed, it shows
 * the formatted text clamped to the row height. Enter, F2 or a click opens
 * the shared editor in a panel under the cell; Shift+F2 opens the larger
 * editor (Access's Zoom box). Save or Ctrl+Enter commits, Esc cancels, and
 * leaving the panel commits, as leaving an Access cell does. A failed save
 * keeps the editor open with the text.
 */
export function RichTextCell({
  value,
  display,
  label,
  header,
  placeholder,
  invalid,
  pending,
  onCommit,
}: {
  /** The stored HTML ("" when empty). */
  value: string;
  /** What the closed cell shows. */
  display: React.ReactNode;
  /** The cell's accessible name. */
  label: string;
  /** The column header, which names the editor. */
  header: string;
  /** Ghost text of an empty cell (the new-entry row). */
  placeholder?: string;
  invalid?: boolean;
  pending?: boolean;
  /** Resolves true when the HTML was taken (saved, or kept in the new-entry draft). */
  onCommit: (html: string) => Promise<boolean>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const skipClickRef = useRef(false);
  const descriptionId = useId();
  const [mode, setMode] = useState<Mode>("closed");
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const place = useCallback(() => {
    const cell = buttonRef.current?.getBoundingClientRect();
    if (cell) {
      setPosition(panelPosition(cell, { width: window.innerWidth, height: window.innerHeight }));
    }
  }, []);

  // The panel follows its cell while the table or the page scrolls.
  useEffect(() => {
    if (mode !== "panel") return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [mode, place]);

  const open = (next: "panel" | "zoom") => {
    if (pending || saving) return;
    setDraft(value);
    if (next === "panel") place();
    setMode(next);
  };

  const close = () => {
    // The larger editor may have been opened from the panel, whose button is gone: back to the cell.
    if (mode === "zoom") requestAnimationFrame(() => buttonRef.current?.focus());
    setMode("closed");
  };

  const commit = async () => {
    if (saving) return;
    if (draft === value) {
      close();
      return;
    }
    setSaving(true);
    const taken = await onCommit(draft);
    setSaving(false);
    if (taken) close();
  };

  const onEditorKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void commit();
    } else if (event.key === "F2" && event.shiftKey && mode === "panel") {
      event.preventDefault();
      setMode("zoom");
    }
  };

  // In the panel the buttons lead and stick to its top: toasts sit at the bottom of the screen.
  const actions = (
    <div
      className={
        mode === "panel"
          ? "sticky top-0 z-10 -mx-3 -mt-3 flex flex-wrap justify-end gap-2 bg-surface p-3"
          : "flex flex-wrap justify-end gap-2"
      }
    >
      {mode === "panel" ? (
        <Button variant="secondary" onClick={() => setMode("zoom")}>
          {messages.datasheet.largerEditor}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={close}>
        {messages.actions.cancel}
      </Button>
      <Button onClick={() => void commit()} pending={saving} data-testid="rich-cell-save">
        {messages.actions.save}
      </Button>
    </div>
  );

  const preview = previewText(value);
  const editorLabel = messages.datasheet.editCell(header);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={preview ? descriptionId : undefined}
        aria-haspopup="dialog"
        aria-expanded={mode !== "closed"}
        data-invalid={invalid || undefined}
        aria-busy={pending || saving || undefined}
        data-rich-cell=""
        onClick={(event) => {
          event.stopPropagation();
          if (skipClickRef.current) {
            skipClickRef.current = false;
            return;
          }
          open("panel");
        }}
        onKeyDown={(event) => {
          if (event.key !== "F2") return;
          event.preventDefault();
          open(event.shiftKey ? "zoom" : "panel");
        }}
        className="block h-(--row-h) w-full cursor-text overflow-hidden px-3 py-2 text-left text-sm text-inherit hover:bg-surface-sunken focus:bg-surface focus:text-ink data-invalid:bg-danger-soft"
      >
        {preview ? (
          // Inert: links in the text are not separate stops inside the cell's button.
          <span inert aria-hidden="true" className="block max-h-full overflow-hidden">
            {display}
          </span>
        ) : placeholder ? (
          <span aria-hidden="true" className="text-ink-muted">
            {placeholder}
          </span>
        ) : null}
        {preview ? (
          <span id={descriptionId} hidden>
            {preview.slice(0, 300)}
          </span>
        ) : null}
      </button>

      <span className="contents" onClick={contain} onKeyDown={contain}>
        {mode === "panel" && position ? (
          <AnchoredPanel
            open
            title={editorLabel}
            testId="rich-cell-panel"
            style={{
              left: position.left,
              width: position.width,
              top: position.top,
              bottom: position.bottom,
              maxHeight: position.maxHeight,
            }}
            onEscape={close}
            onOutside={(target) => {
              if (target && buttonRef.current?.contains(target)) skipClickRef.current = true;
              void commit();
            }}
          >
            <div className="flex flex-col gap-3" onKeyDown={onEditorKeyDown}>
              {actions}
              <RichTextEditor
                name="rich-cell"
                defaultValue={draft}
                onChange={setDraft}
                label={editorLabel}
                autoFocus
              />
            </div>
          </AnchoredPanel>
        ) : null}
        <Dialog
          open={mode === "zoom"}
          onOpenChange={(next) => {
            if (!next) close();
          }}
          title={editorLabel}
          wide
        >
          <div className="flex flex-col gap-3" onKeyDown={onEditorKeyDown}>
            <RichTextEditor
              name="rich-cell"
              defaultValue={draft}
              onChange={setDraft}
              label={editorLabel}
              autoFocus
              tall
              testId="rich-cell-zoom"
            />
            {actions}
          </div>
        </Dialog>
      </span>
    </>
  );
}
