import type { Session } from "@/lib/auth/types";
import type { LookupListKey, LookupLists } from "@/lib/lookup-lists";
import { getLookupLists } from "../repository/lookup-lists";

/**
 * What a list page passes to <LookupListsScope>: the lists its columns, sheet
 * and filters use, and whether the viewer may edit them (Admins, ADR-0022).
 */
export async function loadLookupLists(
  keys: readonly LookupListKey[],
  session: Session,
): Promise<{ lists: LookupLists; canEdit: boolean }> {
  return {
    lists: await getLookupLists(keys, session.userId),
    canEdit: session.role === "Admin",
  };
}
