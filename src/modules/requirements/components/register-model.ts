import { messages } from "@/lib/messages";
import type { MultiSelectOption } from "@/components/ui/form/multi-select";
import {
  coverageLabel,
  coverageOf,
  refList,
  type TypeChangeContext,
} from "../schemas/requirement-rules";
import type { RequirementListRow, RequirementRow } from "../schemas/requirement";
import {
  isNeed,
  REQUIREMENT_TYPES,
  SOLUTION_TYPES,
  type RequirementType,
} from "../schemas/requirement-types";

/**
 * What the register derives from a row before rendering it: the cells that are not stored
 * (coverage, references), which cells a row may edit, and the merge link. DOM-free, so Vitest
 * covers it (ADR-0013); the components only render.
 */

const M = messages.requirements;

/** The register's fields, as both the list row and the sheet's row carry them. */
export type RegisterRow = Pick<
  RequirementRow | RequirementListRow,
  "RequirementType" | "Number" | "Validates" | "ValidatedBy" | "DeliverableIds"
>;

/** The `?type=` filter: a catalog code, else no filter. */
export function registerType(raw: string | undefined): RequirementType | null {
  return REQUIREMENT_TYPES.find((type) => type === raw) ?? null;
}

/** The type a new requirement starts with: the filtered one, else a business requirement. */
export function newRequirementType(filter: RequirementType | null): RequirementType {
  return filter ?? REQUIREMENT_TYPES[0];
}

/** What a type change must keep valid (compatibleTypes), counted from the row's links. */
export function typeChangeContext(row: RegisterRow): TypeChangeContext {
  return {
    type: row.RequirementType,
    validates: row.Validates.length,
    validatedBy: row.ValidatedBy.length,
    allocations: row.DeliverableIds.length,
  };
}

/**
 * Whether the datasheet may edit this row's type: only a row with no link either way and no
 * allocation, since every other row needs the sheet to show what constrains it.
 */
export function typeIsFree(row: RegisterRow): boolean {
  return (
    row.Validates.length === 0 && row.ValidatedBy.length === 0 && row.DeliverableIds.length === 0
  );
}

/** A need's state from the solutions that validate it; a solution has none of its own. */
export function coverageText(row: RegisterRow): string {
  return isNeed(row.RequirementType) ? coverageLabel(coverageOf(row.ValidatedBy)) : M.none;
}

/** "BR-1, SR-2", or "None". */
export function refsText(refs: readonly { type: RequirementType; number: number }[]): string {
  return refs.length > 0 ? refList(refs) : M.none;
}

/** "1.2 Site survey, 2 Rollout" in option order; an option the picker no longer offers is left out. */
export function deliverablesText(
  ids: readonly number[],
  options: readonly MultiSelectOption[],
): string {
  const picked = new Set(ids);
  const labels = options.filter((o) => picked.has(o.id)).map((o) => o.label);
  return labels.length > 0 ? labels.join(", ") : M.none;
}

/** The options a row has picked, in option order — what the sheet's multi-select starts with. */
export function pickedOptions(
  ids: readonly number[],
  options: readonly MultiSelectOption[],
): MultiSelectOption[] {
  const picked = new Set(ids);
  return options.filter((o) => picked.has(o.id));
}

/** The merge link's parameters when every selected row is a need, else null. */
export function mergeSelection(
  rows: readonly (RegisterRow & { RequirementId: number })[],
  selectedIds: readonly (string | number)[],
): { type: RequirementType; validates: string } | null {
  const wanted = new Set(selectedIds.map(String));
  const selected = rows.filter((r) => wanted.has(String(r.RequirementId)));
  if (selected.length === 0 || selected.length !== wanted.size) return null;
  if (!selected.every((r) => isNeed(r.RequirementType))) return null;
  return { type: SOLUTION_TYPES[0]!, validates: selected.map((r) => r.RequirementId).join(",") };
}

/** What deleting a requirement costs, named before it runs (STANDARDS §5.6). */
export function deleteConsequence(row: RegisterRow): string {
  const parts: string[] = [];
  if (row.DeliverableIds.length > 0) parts.push(M.deleteLeaves(row.DeliverableIds.length));
  const refs = refList([...row.Validates, ...row.ValidatedBy]);
  if (refs) parts.push(M.deleteUnlinks(refs));
  return parts.length > 0 ? parts.join(" ") : M.deleteBody;
}
