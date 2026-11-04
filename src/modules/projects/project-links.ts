/**
 * Where a project's own pages live. The Overview is the project's bare route,
 * so every place that shows a project's name builds the same link from here.
 */

/** A project's Overview. */
export function projectOverviewHref(projectId: number): string {
  return `/projects/${projectId}`;
}
