import { execProc } from "@/lib/db";
import {
  groupLookupRows,
  lookupOptionRowSchema,
  saveLookupListInput,
  type LookupList,
  type LookupListKey,
  type LookupLists,
  type SaveLookupListInput,
} from "@/lib/lookup-lists";

/**
 * The live options of the given dropdown lists (ADR-0022), each with the RowVer
 * the editor sends back. Any signed-in user may read them.
 */
export async function getLookupLists(
  keys: readonly LookupListKey[],
  actorUserId: number,
): Promise<LookupLists> {
  if (keys.length === 0) return {};
  const rows = await execProc("usp_LookupList_GetOptions", {
    ActorUserId: actorUserId,
    ListKeys: JSON.stringify([...new Set(keys)]),
  });
  return groupLookupRows(rows.map((r) => lookupOptionRowSchema.parse(r)));
}

/**
 * Saves one list as a whole (Admin only; the proc renames, retires, revives and
 * adds options, cascades renames to records and audits). Returns the saved list.
 */
export async function saveLookupList(
  input: SaveLookupListInput,
  actorUserId: number,
): Promise<LookupList> {
  const parsed = saveLookupListInput.parse(input);
  const rows = await execProc("usp_LookupList_Set", {
    ListKey: parsed.listKey,
    OptionsJson: JSON.stringify(parsed.options),
    RowVer: parsed.rowVer,
    ActorUserId: actorUserId,
    TintRows: parsed.tintRows ?? null,
  });
  const list = groupLookupRows(rows.map((r) => lookupOptionRowSchema.parse(r)))[parsed.listKey];
  if (!list) throw new Error(`usp_LookupList_Set returned no rows for ${parsed.listKey}`);
  return list;
}
