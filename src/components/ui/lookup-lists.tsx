"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ActionResult } from "@/lib/action";
import {
  ID_BOUND_LISTS,
  listChoices,
  optionColor,
  type LookupList,
  type LookupListKey,
  type LookupLists,
  type SaveLookupListInput,
} from "@/lib/lookup-lists";
import { Badge } from "./badge";

/**
 * Managed dropdown lists on the client (ADR-0022): one provider per page holds
 * the lists the page loaded, so the datasheet cells, the add row, the record
 * sheet and the toolbar filters all read the same options. Saving a list in the
 * editor replaces it here at once (every select re-renders with the new
 * options) and refreshes the route so records whose label was renamed show it.
 */
interface LookupListsValue {
  lists: LookupLists;
  /** Whether the viewer may edit the lists (Admin): shows the header carets. */
  canEdit: boolean;
  save: (input: SaveLookupListInput) => Promise<ActionResult<LookupList>>;
}

const LookupListsContext = createContext<LookupListsValue | null>(null);

export function LookupListsProvider({
  lists,
  canEdit,
  onSave,
  children,
}: {
  lists: LookupLists;
  canEdit: boolean;
  /** The save Server Action (src/modules/lookup-lists/actions), injected by the page's view. */
  onSave: (input: SaveLookupListInput) => Promise<ActionResult<LookupList>>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(lists);
  // New server data (navigation, router.refresh) replaces the local copy
  // (React-recommended setState-during-render pattern — not an effect).
  const [prevLists, setPrevLists] = useState(lists);
  if (prevLists !== lists) {
    setPrevLists(lists);
    setCurrent(lists);
  }

  const save = useCallback(
    async (input: SaveLookupListInput) => {
      const result = await onSave(input);
      if (result.ok) {
        setCurrent((all) => ({ ...all, [result.data.key]: result.data }));
        router.refresh();
      }
      return result;
    },
    [onSave, router],
  );

  const value = useMemo(() => ({ lists: current, canEdit, save }), [current, canEdit, save]);
  return <LookupListsContext.Provider value={value}>{children}</LookupListsContext.Provider>;
}

/** The page's lists; empty and read-only outside a provider. */
export function useLookupLists(): LookupListsValue {
  return useContext(LookupListsContext) ?? NO_LISTS;
}

const NO_LISTS: LookupListsValue = {
  lists: {},
  canEdit: false,
  save: async () => ({ ok: false, error: { code: "FORBIDDEN", message: "" } }),
};

/**
 * The <option>s of a list-bound select: live options plus the record's current
 * value when it has been retired (see listChoices). The caller renders its own
 * empty option first ("None", "All statuses"…).
 */
export function ListOptions({
  list,
  current,
  currentLabel,
}: {
  list: LookupListKey;
  /** The record's stored value (label, or option id for id-bound lists). */
  current?: string | number | null;
  /** Label of `current` for id-bound lists. */
  currentLabel?: string | null;
}) {
  const { lists } = useLookupLists();
  const value = current == null ? "" : String(current);
  const choices = listChoices(lists[list], ID_BOUND_LISTS.includes(list), {
    value,
    label: currentLabel ?? null,
  });
  return (
    <>
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </>
  );
}

/**
 * A list value as a badge in its colour (migration 020): read-only datasheet
 * cells and cards. Values without a colour keep Badge's built-in vocabulary.
 */
export function ListBadge({
  list,
  value,
  label,
}: {
  list: LookupListKey;
  /** The stored value (label, or option id for id-bound lists). */
  value: string | null;
  /** What the badge reads; defaults to `value`. */
  label?: string | null;
}) {
  const { lists } = useLookupLists();
  return <Badge value={label ?? value} tone={optionColor(lists[list], value)} />;
}
