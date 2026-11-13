import { toCsv } from "@/lib/csv";
import { frameworkRole, type ResponsibilityFramework } from "./responsibility-frameworks";
import type { ResponsibilityGrid } from "./responsibility-grid";
import type { ResponsibilityMember, ResponsibilityRowRef } from "./responsibility-matrix";

export interface CsvRow {
  ref: ResponsibilityRowRef;
  label: string;
}

/** A line per row and a column per member, each cell the role's abbreviation, as on screen. */
export function responsibilityCsv(
  framework: ResponsibilityFramework,
  corner: string,
  members: readonly Pick<ResponsibilityMember, "stakeholderId" | "name">[],
  rows: readonly CsvRow[],
  grid: Pick<ResponsibilityGrid, "roleAt">,
): string {
  const abbrev = (code: string | null) =>
    code === null ? "" : (frameworkRole(framework, code)?.abbrev ?? code);
  return toCsv([
    [corner, ...members.map((m) => m.name)],
    ...rows.map((r) => [
      r.label,
      ...members.map((m) => abbrev(grid.roleAt(r.ref, m.stakeholderId))),
    ]),
  ]);
}
