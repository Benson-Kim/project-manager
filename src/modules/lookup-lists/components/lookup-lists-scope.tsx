"use client";

import { LookupListsProvider } from "@/components/ui/lookup-lists";
import type { LookupLists } from "@/lib/lookup-lists";
import { saveLookupListAction } from "../actions";

/**
 * Wraps a list page's view in the lists it loaded (ADR-0022), wired to the
 * save action — so the shared UI provider never imports a module.
 * Usage in a page: `<LookupListsScope {...await loadLookupLists(KEYS, session)}>`.
 */
export function LookupListsScope({
  lists,
  canEdit,
  children,
}: {
  lists: LookupLists;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  return (
    <LookupListsProvider lists={lists} canEdit={canEdit} onSave={saveLookupListAction}>
      {children}
    </LookupListsProvider>
  );
}
