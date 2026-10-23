/**
 * Where notebooks live in the app (ADR-0035): a project's notebooks under the
 * project, project-less ones in the shared space at /notes. Isomorphic.
 */

export const NOTES_HREF = "/notes";

/** The list a notebook belongs to. */
export function notesListHref(projectId: number | null): string {
  return projectId === null ? NOTES_HREF : `/projects/${projectId}/notes`;
}

/** A notebook's workspace. */
export function noteHref(note: { NoteId: number; ProjectId: number | null }): string {
  return `${notesListHref(note.ProjectId)}/${note.NoteId}`;
}
