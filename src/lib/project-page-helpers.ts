/**
 * Shared helpers for project-scoped list pages.
 * DOM-free — testable in vitest node env.
 *
 * Placed in src/lib/ (not inside a route group) so any current or future
 * module page can import it without reaching through the routing hierarchy.
 */

/**
 * Builds the "New [entity]" href from the current flat searchParams.
 * Preserves all existing URL params (sort, filter, view…) and sets
 * the given param name to "new". Excludes the current value of that param.
 *
 * @param basePath  e.g. "/projects/42/stakeholders"
 * @param raw       flattenSearchParams result from the page
 * @param paramName the sheet param key — "id" for most modules, "d" for deliverables
 */
export function buildNewEntityHref(
  basePath: string,
  raw: Record<string, string | undefined>,
  paramName = "id",
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value && key !== paramName) params.set(key, value);
  }
  params.set(paramName, "new");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Cross-project leak guard: returns the entity only when it belongs to the
 * current project; otherwise null. Deep links to another project's records
 * are treated as not found.
 *
 * The constraint accepts `number | null` to match existing row schemas that
 * type the FK column as nullable (z.number().nullable()). An entity with a
 * null ProjectId will never match a valid projectId and is correctly excluded.
 * When those row schemas are tightened to `number`, this constraint can be
 * narrowed accordingly.
 */
export function guardProjectScope<T extends { ProjectId: number | null }>(
  entity: T | null | undefined,
  projectId: number,
): T | null {
  return entity != null && entity.ProjectId === projectId ? entity : null;
}
