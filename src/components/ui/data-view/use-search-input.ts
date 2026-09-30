"use client";

import { useEffect, useRef, useState } from "react";
import { useListUrlState } from "./use-list-url-state";

/**
 * Debounced search input state.
 *
 * Strategy: debounce fires after `delay` ms of inactivity. onBlur flushes
 * any pending timer immediately — covering both the "type and wait" pattern
 * (stakeholders/suppliers/keywords) and the "type then tab-away" pattern
 * (deliverables). This single hook replaces the separate debounce + onBlur
 * implementations that previously lived in each toolbar.
 *
 * Returns { value, onChange, onBlur } for use in SearchInput.
 */
export function useSearchInput(delay = 250) {
  const { searchParams, update } = useListUrlState();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const flush = (next: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    update({ q: next || null });
  };

  const onChange = (next: string) => {
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(next), delay);
  };

  const onBlur = () => {
    // Flush immediately so tab-away or form-submit always sends the current value.
    if (timerRef.current) flush(value);
  };

  return { value, onChange, onBlur };
}
