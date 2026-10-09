import { canInProject } from "@/lib/auth/rbac";
import type { AccessLevel, Permission } from "@/lib/auth/types";
import type { ListChoice } from "@/lib/lookup-lists";

/**
 * The projects an actor can see, for pickers and filters on the cross-project
 * lists (/daily-activities, /todo): the Project column's select and the
 * toolbar's project filter. Isomorphic — pages and client views share it.
 */
export interface ProjectOption {
  id: number;
  name: string;
  /** The actor's level on the project (ADR-0021), from usp_Project_List's ActorAccess. */
  access: AccessLevel | null;
}

/** The projects where the actor's level allows `permission` (e.g. "daily-activities:create"). */
export function projectChoices(
  options: readonly ProjectOption[],
  permission: Permission,
): ListChoice[] {
  return options
    .filter((option) => canInProject(option.access, permission))
    .map((option) => ({ value: String(option.id), label: option.name }));
}

/** The `?project=` filter of a cross-project list. */
export type ProjectFilter =
  { kind: "all" } | { kind: "none" } | { kind: "project"; projectId: number };

export const NO_PROJECT_PARAM = "none";

/**
 * Reads `?project=`: "none" (project-less records only), the id of a project the
 * actor can see, or anything else = no filter — an unknown or hidden id never
 * reaches the proc (whose access check would turn it into an error page).
 */
export function parseProjectFilter(
  raw: string | undefined,
  options: readonly ProjectOption[],
): ProjectFilter {
  if (raw === NO_PROJECT_PARAM) return { kind: "none" };
  const projectId = Number(raw);
  return Number.isInteger(projectId) && options.some((option) => option.id === projectId)
    ? { kind: "project", projectId }
    : { kind: "all" };
}

/** What a datasheet's Project column offers (projectColumn): its choices and starting value. */
export interface ProjectPicker {
  /** The projects a record may be put in. */
  choices: ListChoice[];
  /** Whether "No project" (the project-less shared space) is offered. */
  clearable: boolean;
  /** The new-entry row's project: the page's or filter's project when allowed, else none/first. */
  initial: string;
}

/**
 * The Project column for an actor: projects where their level allows
 * `permission`, "No project" when they may use the shared space, and the
 * new-entry row starting in `preferredProjectId` (the route's or the filter's).
 */
export function projectPicker(
  options: readonly ProjectOption[],
  permission: Permission,
  canUseProjectless: boolean,
  preferredProjectId: number | null,
): ProjectPicker {
  const choices = projectChoices(options, permission);
  const preferred = preferredProjectId === null ? "" : String(preferredProjectId);
  const initial = choices.some((choice) => choice.value === preferred)
    ? preferred
    : canUseProjectless
      ? ""
      : (choices[0]?.value ?? "");
  return { choices, clearable: canUseProjectless, initial };
}

/** Whether a picker leaves anywhere to add a record (a project, or the shared space). */
export function canAddWith(picker: ProjectPicker): boolean {
  return picker.clearable || picker.choices.length > 0;
}

/** The project a `?project=` filter points at (for the new-entry row), or null. */
export function filteredProjectId(filter: ProjectFilter): number | null {
  return filter.kind === "project" ? filter.projectId : null;
}
