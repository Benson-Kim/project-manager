import { messages } from "@/lib/messages";
import type { MultiSelectOption } from "@/components/ui/form/multi-select";
import {
  coverageLabel,
  coverageOf,
  parentRefOf,
  refList,
  type RefLike,
  type TypeChangeContext,
} from "../schemas/requirement-rules";
import type { RequirementListRow, RequirementRow } from "../schemas/requirement";
import { MAX_REQUIREMENT_DEPTH } from "../schemas/requirement";
import {
  isNeed,
  REQUIREMENT_TYPES,
  SOLUTION_TYPES,
  typeLabel,
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
  | "RequirementType"
  | "Ref"
  | "Depth"
  | "ChildCount"
  | "Validates"
  | "ValidatedBy"
  | "DeliverableIds"
>;

/**
 * The tree, as the register draws it (ADR-0048). The mock-up the client sent is the specification:
 * a sub-requirement is indented under its parent, its reference is prefixed with an arrow, and its
 * Type column reads "Sub-Requirement" while the type itself stays visible in the reference's
 * letters. Depth and Ref both come from the server, because the register is paged and a child can
 * land on a page its parent is not on.
 */

/** "FR-1.1", indented by its depth and marked as a child. */
export function refCell(row: RegisterRow): string {
  return row.Depth === 0 ? row.Ref : `${"\u00a0".repeat(row.Depth * 2)}\u21b3 ${row.Ref}`;
}

/** "Functional", or "Sub-Requirement" for a child — the relationship, as the mock-up shows it. */
export function typeCell(row: RegisterRow): string {
  return row.Depth > 0 ? M.subRequirement : typeLabel(row.RequirementType);
}

/** Whether this row may take one more level under it, so the action is offered only where it works. */
export function canAddSubRequirement(row: RegisterRow): boolean {
  return row.Depth + 1 < MAX_REQUIREMENT_DEPTH;
}

/** "Sub-requirement of FR-1", or null for a root. Read-only: nothing re-parents a requirement. */
export function parentText(row: RegisterRow): string | null {
  const parent = parentRefOf(row.Ref);
  return parent === null ? null : M.subRequirementOf(parent);
}

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
    row.Validates.length === 0 &&
    row.ValidatedBy.length === 0 &&
    row.DeliverableIds.length === 0 &&
    // A child's type is its parent's, and a parent's is pinned by the references its children
    // carry; usp_Requirement_Update refuses both, so the cell does not offer them (ADR-0048).
    row.Depth === 0 &&
    row.ChildCount === 0
  );
}

/** Why the type cannot be changed here, or null when it can — named before the attempt (§5.6). */
export function typeBlockedReason(row: RegisterRow): string | null {
  if (row.Depth > 0) return M.typeIsParents;
  if (row.ChildCount > 0) return M.subRequirementsBlockType(row.ChildCount);
  return null;
}

/** Why this row cannot be deleted yet, or null when it can. */
export function deleteBlockedReason(row: RegisterRow): string | null {
  return row.ChildCount > 0 ? M.subRequirementsBlockDelete(row.ChildCount) : null;
}

/** A need's state from the solutions that validate it; a solution has none of its own. */
export function coverageText(row: RegisterRow): string {
  return isNeed(row.RequirementType) ? coverageLabel(coverageOf(row.ValidatedBy)) : M.none;
}

/** "BR-1, BR-1.2, SR-2", or "None". */
export function refsText(refs: readonly RefLike[]): string {
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
