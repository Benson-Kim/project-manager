"use client";

import { useEffect, useRef, useState } from "react";

export interface DraftInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
> {
  value: string;
  /** Called on Enter, on Tab after typing, and on leaving the field, when the text changed. */
  onCommit: (next: string) => void;
  /** Tab or Shift+Tab pressed after typing (or while `typing`); true when it was used. */
  onTypedTab?: (shift: boolean) => boolean;
  /** Treat the field as being typed in, though nothing was typed since it got focus. */
  typing?: boolean;
  /** Enter or Escape: the user is done with the field. */
  onSettle?: () => void;
  /**
   * Hand back a changed copy when the field is removed while it has focus. Removing a focused
   * field fires no blur, so without this the typing is lost.
   */
  commitOnUnmount?: boolean;
}

/**
 * A text, date or number field that edits a copy of its value and hands the
 * result back once the user is done with it, so a half-typed date or name is
 * never saved. A new value from outside replaces the copy unless the field has
 * focus; Escape puts the value back.
 */
export function DraftInput({
  value,
  onCommit,
  onTypedTab,
  typing = false,
  onSettle,
  onFocus,
  onBlur,
  onKeyDown,
  commitOnUnmount = false,
  ...rest
}: DraftInputProps) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(false);
  const latest = useRef({ draft, value, focused, onCommit });
  useEffect(() => {
    latest.current = { draft, value, focused, onCommit };
  });
  useEffect(() => {
    if (!commitOnUnmount) return;
    return () => {
      const last = latest.current;
      if (last.focused && last.draft !== last.value) last.onCommit(last.draft);
    };
  }, [commitOnUnmount]);
  if (value !== shown) {
    setShown(value);
    if (!focused) setDraft(value);
  }

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  return (
    <input
      {...rest}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        setTyped(true);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        setTyped(false);
        commit();
        setDraft(value);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || rest.readOnly) return;
        if (event.key === "Enter") {
          event.preventDefault();
          setTyped(false);
          commit();
          onSettle?.();
        } else if (event.key === "Escape" && draft !== value) {
          event.preventDefault();
          setDraft(value);
          setTyped(false);
          onSettle?.();
        } else if (event.key === "Tab" && (typed || typing) && onTypedTab) {
          commit();
          if (onTypedTab(event.shiftKey)) event.preventDefault();
        }
      }}
    />
  );
}
